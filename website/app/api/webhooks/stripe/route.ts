export const runtime = 'nodejs';

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
  _id?: mongoose.Types.ObjectId | string;
  stock?: number;
  coffeeId?: mongoose.Types.ObjectId | string;
  slug?: string;
  // allow extra fields without referencing them
  [k: string]: unknown;
}

interface OrderItem {
  id: string;
  qty: number;
  source?: ProductSource | string;
  // allow extra fields
  [k: string]: unknown;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  items?: OrderItem[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  metadata?: Record<string, unknown>;
  save(opts?: { session?: mongoose.ClientSession }): Promise<this>;
  // allow other fields
  [k: string]: unknown;
}

/**
 * Atomically decrement stock for one item.
 * Throws if item not found or insufficient stock.
 * Returns before/after quantities for audit.
 */
async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: string }
): Promise<{ id: string; qty: number; source: string; before: number; after: number }> {
  const { id, qty, source = 'variant' } = item;

  const sessionOpt = session ?? undefined; // pass undefined if null

  if (source === 'variant') {
    const updated = (await CoffeeVariant.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or variant not found for id=${id}`);
    }

    // Optionally update parent Coffee.totalStock if you maintain that field
    if (updated.coffeeId) {
      await Coffee.findByIdAndUpdate(updated.coffeeId, { $inc: { totalStock: -qty } }, { session: sessionOpt }).exec();
    }

    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  if (source === 'coffee') {
    const updated = (await Coffee.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or coffee not found for id=${id}`);
    }
    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  if (source === 'equipment') {
    // try by object id first, then by slug
    let updated = null as ProductDocLean | null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true, session: sessionOpt, lean: true }
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
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

  // raw body required for Stripe signature verification
  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;

      // safely extract metadata.order_id (metadata may be undefined or not an object)
      const orderIdRaw = (pi.metadata && typeof pi.metadata === 'object') ? (pi.metadata as Record<string, unknown>)['order_id'] : undefined;
      const orderId = typeof orderIdRaw === 'string' ? orderIdRaw : null;
      const paymentIntentId = pi.id;

      await dbConnect();

      // find order by metadata.order_id or by paymentIntentId
      let order = null as OrderDocument | null;
      if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
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

      // idempotent: skip already-processed orders
      if (order.status === 'paid' || order.status === 'shipped') {
        console.log('Webhook: order already processed', order._id.toString());
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // run atomic decrements inside a transaction (requires replica set / Atlas)
      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();
      try {
        const stockChanges: Array<{ id: string; qty: number; source?: string; before: number; after: number }> = [];

        const items = Array.isArray(order.items) ? order.items : [];
        if (items.length === 0) {
          // No items to decrement — mark paid and continue
          order.status = 'paid';
          order.paymentIntentId = paymentIntentId;
          order.paidAt = new Date();
          const metadata = { ...(order.metadata ?? {}), prices_verified: true };
          order.metadata = metadata;
          await order.save({ session });
          await session.commitTransaction();
          session.endSession();
          console.log(`Order ${order._id.toString()} marked paid (no items).`);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        for (const rawItem of items) {
          // validate item shape at runtime
          if (!rawItem || typeof rawItem !== 'object') {
            throw new Error('Order contains invalid item');
          }
          const rec = rawItem as Record<string, unknown>;
          const id = typeof rec.id === 'string' ? rec.id : String(rec.id ?? '');
          const qtyRaw = rec.qty ?? rec.quantity;
          const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw ?? 0);
          const source = typeof rec.source === 'string' ? rec.source : 'variant';

          if (!id) throw new Error('Order contains item with missing id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Order contains item with invalid qty for id=${id}`);

          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
        }

        order.status = 'paid';
        order.paymentIntentId = paymentIntentId;
        order.paidAt = new Date();
        order.metadata = { ...(order.metadata ?? {}), stockChanges, prices_verified: true };
        await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        console.log(`Order ${order._id.toString()} marked paid and stock decremented.`);
        return NextResponse.json({ received: true }, { status: 200 });
      } catch (txErr) {
        await session.abortTransaction();
        session.endSession();

        const msg = txErr instanceof Error ? txErr.message : String(txErr);
        console.error('Error processing payment webhook (transaction aborted):', msg);

        try {
          order.status = 'failed';
          order.metadata = { ...(order.metadata ?? {}), failureReason: msg };
          await order.save();
        } catch (e) {
          console.error('Failed to mark order failed after transaction error', e);
        }

        return new Response('Processing error', { status: 500 });
      }
    }

    // ack other events
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Webhook handler error', { status: 500 });
  }
}