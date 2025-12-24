import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';

type ProductSource = 'variant' | 'coffee' | 'equipment';

interface ProductDocLean {
  _id?: mongoose. Types.ObjectId | string;
  stock?: number;
  coffeeId?: mongoose.Types.ObjectId | string;
  slug?:  string;
  [k: string]: unknown;
}

interface OrderItem {
  id: string;
  qty: number;
  source?: ProductSource | string;
  [k: string]: unknown;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  items?: OrderItem[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  metadata?: Record<string, unknown>;
  client?: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    unit?: string;
    line1?: string;
    city?:  string;
    postcode?: string;
    country?: string;
  } | null;
  save(opts?: { session?: mongoose. ClientSession }): Promise<this>;
  [k: string]: unknown;
}

async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: string }
): Promise<{ id: string; qty: number; source:  string; before: number; after:  number }> {
  const { id, qty, source = 'variant' } = item;
  const sessionOpt = session ?? undefined;

  if (source === 'variant') {
    const updated = (await CoffeeVariant.findOneAndUpdate(
      { _id: id, stock:  { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or variant not found for id=${id}`);
    }

    if (updated.coffeeId) {
      await Coffee.findByIdAndUpdate(updated.coffeeId, { $inc: { totalStock: -qty } }, { session: sessionOpt }).exec();
    }

    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  if (source === 'coffee') {
    const updated = (await Coffee.findOneAndUpdate(
      { _id: id, stock: { $gte:  qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or coffee not found for id=${id}`);
    }

    return { id, qty, source, before:  updated.stock + qty, after: updated.stock };
  }

  if (source === 'equipment') {
    let updated = null as ProductDocLean | null;
    
    if (mongoose. Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, stock: { $gte: qty } },
        { $inc:  { stock: -qty } },
        { new: true, session:  sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }

    if (!updated) {
      updated = (await Equipment.findOneAndUpdate(
        { slug: id, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or equipment not found for id/slug=${id}`);
    }

    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  throw new Error(`Unknown product source for id=${id}`);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env. STRIPE_SECRET_KEY;

  if (!webhookSecret || ! stripeSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('stripe-signature') ?? '';

  let event:  Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    if (event. type === 'payment_intent. succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      
      const orderIdRaw = (pi.metadata && typeof pi.metadata === 'object')
        ? (pi.metadata as Record<string, unknown>)['order_id']
        : undefined;
      const orderId = typeof orderIdRaw === 'string' ? orderIdRaw : null;
      const paymentIntentId = pi.id;

      await dbConnect();

      let order = null as OrderDocument | null;
      
      if (orderId && mongoose. Types.ObjectId.isValid(orderId)) {
        const found = await Order.findById(orderId).exec();
        order = found as OrderDocument | null;
      }

      if (!order) {
        const found = await Order.findOne({ paymentIntentId }).exec();
        order = found as OrderDocument | null;
      }

      if (!order) {
        console.warn('Webhook: no order found for PaymentIntent', paymentIntentId, 'metadata.order_id=', orderId);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // ✅ KEY FIX: Check if stock was already decremented
      const alreadyDecremented = order.metadata?.stockDecremented === true;
      
      if (order.status === 'paid' || order.status === 'shipped') {
        console.log('Webhook: order already processed', order._id.toString());
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();

      try {
        const stockChanges: Array<{ id: string; qty: number; source?: string; before: number; after: number }> = [];
        const items = Array.isArray(order.items) ? order.items : [];

        // ✅ Only decrement stock if not already done
        if (!alreadyDecremented && items.length > 0) {
          for (const rawItem of items) {
            if (! rawItem || typeof rawItem !== 'object') {
              throw new Error('Order contains invalid item');
            }

            const rec = rawItem as Record<string, unknown>;
            const id = typeof rec. id === 'string' ? rec.id : String(rec.id ?? '');
            const qtyRaw = rec.qty ?? rec.quantity;
            const qty = typeof qtyRaw === 'number' ? qtyRaw :  Number(qtyRaw ?? 0);
            const source = typeof rec.source === 'string' ? rec.source : 'variant';

            if (!id) throw new Error('Order contains item with missing id');
            if (!Number. isFinite(qty) || qty <= 0) throw new Error(`Order contains item with invalid qty for id=${id}`);

            const change = await decrementOneAtomic(session, { id, qty, source });
            stockChanges. push(change);
          }
        }

        // ✅ CRITICAL: Fetch order within transaction and preserve existing fields
        const orderInSession = (await Order. findById(order._id).session(session).exec()) as OrderDocument | null;
        
        if (!orderInSession) {
          throw new Error('Order disappeared during transaction');
        }

        // ✅ NEW: Extract billing details from PaymentIntent
        const billingDetails = pi.payment_method 
          ? await stripe.paymentMethods.retrieve(pi.payment_method as string).catch(() => null)
          : null;

        // ✅ NEW: Update client info if not already set (preserve existing data)
        if (!orderInSession.client && billingDetails?. billing_details) {
          const bd = billingDetails.billing_details;
          orderInSession.client = {
            name: bd. name || undefined,
            email: bd. email || undefined,
            phone:  bd.phone || undefined,
          };
        }

        // ✅ NEW: Update shipping address if not already set (preserve existing data)
        if (!orderInSession.shippingAddress && billingDetails?.billing_details?. address) {
          const addr = billingDetails.billing_details.address;
          const name = billingDetails.billing_details.name || '';
          const nameParts = name.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          orderInSession.shippingAddress = {
            firstName:  firstName || undefined,
            lastName:  lastName || undefined,
            email:  billingDetails.billing_details.email || undefined,
            phone: billingDetails.billing_details.phone || undefined,
            unit: addr.line2 || undefined,
            line1: addr.line1 || undefined,
            city: addr.city || undefined,
            postcode:  addr.postal_code || undefined,
            country: addr.country || 'GB',
          };
        }

        // ✅ Preserve existing shipping address and client info (don't overwrite)
        orderInSession.status = 'paid';
        orderInSession.paymentIntentId = paymentIntentId;
        orderInSession. paidAt = orderInSession. paidAt || new Date();
        
        // ✅ Merge metadata without losing existing data
        orderInSession.metadata = {
          ...(orderInSession. metadata ?? {}),
          stockDecremented: true,
          stockChanges: alreadyDecremented ? (orderInSession.metadata?.stockChanges ?? []) : stockChanges,
          prices_verified: true,
        };

        await orderInSession.save({ session });
        await session.commitTransaction();
        session.endSession();

        console.log(`Order ${order._id.toString()} marked paid. Stock ${alreadyDecremented ? 'already decremented' : 'decremented'}.`);
        return NextResponse.json({ received: true }, { status: 200 });
        
      } catch (txErr) {
        await session.abortTransaction();
        session.endSession();
        
        const msg = txErr instanceof Error ? txErr. message : String(txErr);
        console.error('Error processing payment webhook (transaction aborted):', msg);
        
        try {
          order.status = 'failed';
          order.metadata = {
            ...(order.metadata ??  {}),
            failureReason: msg
          };
          await order.save();
        } catch (e) {
          console. error('Failed to mark order failed after transaction error', e);
        }
        
        return new Response('Processing error', { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Webhook handler error', { status:  500 });
  }
}

export const runtime = 'nodejs';