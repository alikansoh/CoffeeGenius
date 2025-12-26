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
  [k: string]: unknown;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  items?: unknown[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  client?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  save(opts?: { session?: mongoose.ClientSession }): Promise<this>;
  [k: string]: unknown;
}

async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: string }
): Promise<{ id: string; qty: number; source: string; before: number; after: number }> {
  const { id, qty, source = 'variant' } = item;
  const sessionOpt = session ?? undefined;

  console.log(`[decrementOneAtomic] ${qty}x ${source} id=${id}`);

  if (source === 'variant') {
    const updated = (await CoffeeVariant.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
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

// Health check endpoint
export async function GET() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  
  return NextResponse.json({
    status: 'Webhook endpoint is running',
    timestamp: new Date().toISOString(),
    config: {
      webhookSecretConfigured: !!webhookSecret,
      stripeSecretConfigured: !!stripeSecret,
    }
  });
}

export async function POST(req: Request) {
  console.log('\n========== WEBHOOK RECEIVED ==========');
  console.log('Timestamp:', new Date().toISOString());
  
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  
  console.log('[Config]');
  console.log('- Webhook secret:', webhookSecret ? '✅ Set' : '❌ Missing');
  console.log('- Stripe secret:', stripeSecret ? '✅ Set' : '❌ Missing');
  
  if (!webhookSecret || !stripeSecret) {
    console.error('❌ Missing Stripe configuration');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('stripe-signature') ?? '';

  if (!sig) {
    console.error('❌ No signature header');
    return new Response('No signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('✅ Signature verified');
  } catch (err) {
    console.error('❌ Signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('Event type:', event.type);
  console.log('Event ID:', event.id);

  try {
    if (event.type === 'payment_intent.succeeded') {
      console.log('✅ Processing payment_intent.succeeded');
      
      const pi = event.data.object as Stripe.PaymentIntent;
      const paymentIntentId = pi.id;

      console.log('Payment Intent ID:', paymentIntentId);
      console.log('Amount:', pi.amount, 'pence');

      await dbConnect();
      console.log('✅ DB connected');

      // ============================================================
      // CRITICAL FIX: Use findOneAndUpdate with upsert to prevent duplicates
      // This creates the order atomically, ensuring only ONE order is created
      // even if multiple webhooks fire simultaneously
      // ============================================================
      
      const existingOrder = await Order.findOneAndUpdate(
          { paymentIntentId },
          {
              $setOnInsert: {
                  paymentIntentId,
                  status: 'processing', // Temporary status to claim this order
                  createdAt: new Date(),
                  metadata: {
                      webhookEventId: event.id,
                      processingStarted: new Date().toISOString()
                  }
              }
          },
          {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true
          }
      ).exec() as unknown as OrderDocument;

      // Check if this order was already fully processed
      if (existingOrder.status === 'paid' || existingOrder.status === 'failed') {
        console.log(`⚠️ Order already processed with status: ${existingOrder.status}`);
        console.log('Order ID:', existingOrder._id.toString());
        return NextResponse.json({ 
          received: true, 
          message: `Order already processed (${existingOrder.status})`,
          orderId: existingOrder._id.toString()
        }, { status: 200 });
      }

      // If status is 'processing', this webhook won the race - proceed with order creation
      console.log('✅ This webhook will process the order');

      // Re-fetch latest PaymentIntent
      let latestPI: Stripe.PaymentIntent;
      try {
        latestPI = await stripe.paymentIntents.retrieve(paymentIntentId);
        console.log('✅ Retrieved latest PI');
      } catch (err) {
        console.warn('⚠️ Failed to retrieve latest PI:', err);
        latestPI = pi;
      }

      const metadata = latestPI.metadata && typeof latestPI.metadata === 'object' ? latestPI.metadata : {};
      
      console.log('Metadata keys:', Object.keys(metadata));

      // Parse items
      const itemsJson = (metadata.items as string) || '[]';
      console.log('Items JSON length:', itemsJson.length);

      const subtotal = parseFloat((metadata.subtotal as string) ?? '') || 0;
      const shipping = parseFloat((metadata.shipping as string) ?? '') || 0;
      const total = parseFloat((metadata.total as string) ?? '') || 0;

      console.log('Totals - Subtotal:', subtotal, 'Shipping:', shipping, 'Total:', total);

      // Parse addresses
      let shippingAddress = null;
      if (metadata.shippingAddress) {
        try {
          shippingAddress = JSON.parse(metadata.shippingAddress as string);
          console.log('✅ Parsed shipping address');
        } catch (err) {
          console.warn('⚠️ Failed to parse shippingAddress:', err);
        }
      }

      let billingAddress = null;
      if (metadata.billingAddress) {
        try {
          billingAddress = JSON.parse(metadata.billingAddress as string);
          console.log('✅ Parsed billing address');
        } catch (err) {
          console.warn('⚠️ Failed to parse billingAddress:', err);
        }
      }

      let client = null;
      if (metadata.client) {
        try {
          client = JSON.parse(metadata.client as string);
          console.log('✅ Parsed client info');
        } catch (err) {
          console.warn('⚠️ Failed to parse client:', err);
        }
      }

      // Parse items array
      let items: Array<{ id: string; name: string; qty: number; unitPrice: number; totalPrice: number; source: string }> = [];
      try {
        items = JSON.parse(itemsJson);
        console.log('✅ Parsed', items.length, 'items');
      } catch (err) {
        console.error('❌ Failed to parse items:', err);
        
        // Mark order as failed
        existingOrder.status = 'failed';
        existingOrder.metadata = {
          ...(existingOrder.metadata || {}),
          failureReason: 'Invalid items metadata',
          webhookEventId: event.id
        };
        await existingOrder.save();
        
        return new Response('Invalid items metadata', { status: 500 });
      }

      if (!Array.isArray(items) || items.length === 0) {
        console.error('❌ No items found');
        
        // Mark order as failed
        existingOrder.status = 'failed';
        existingOrder.metadata = {
          ...(existingOrder.metadata || {}),
          failureReason: 'No items in metadata',
          webhookEventId: event.id
        };
        await existingOrder.save();
        
        return new Response('No items in metadata', { status: 500 });
      }

      // Start transaction for stock updates
      console.log('Starting transaction...');
      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();

      try {
        const stockChanges: Array<{ id: string; qty: number; source?: string; before: number; after: number }> = [];

        // Decrement stock
        console.log('Decrementing stock...');
        for (const item of items) {
          const id = typeof item.id === 'string' ? item.id : String(item.id ?? '');
          const qty = typeof item.qty === 'number' ? item.qty : Number(item.qty ?? 0);
          const source = typeof item.source === 'string' ? item.source : 'variant';

          if (!id) throw new Error('Missing item id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid qty for id=${id}`);

          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
          console.log(`✅ ${item.name}: ${change.before} → ${change.after}`);
        }

        // Update the existing order with full details
        console.log('Updating order with full details...');
        existingOrder.items = items;
        existingOrder.subtotal = Number(subtotal.toFixed(2));
        existingOrder.shipping = Number(shipping.toFixed(2));
        existingOrder.total = Number(total.toFixed(2));
        existingOrder.currency = 'gbp';
        existingOrder.status = 'paid';
        existingOrder.paidAt = new Date();
        existingOrder.metadata = {
          prices_verified: true,
          stockChanges,
          stockDecremented: true,
          pricedAt: new Date().toISOString(),
          shippingConfirmed: !!shippingAddress,
          webhookEventId: event.id,
          processedAt: new Date().toISOString()
        };

        if (shippingAddress) existingOrder.shippingAddress = shippingAddress;
        if (billingAddress) existingOrder.billingAddress = billingAddress;
        if (client) existingOrder.client = client;

        await existingOrder.save({ session });
        console.log('✅ Order updated:', existingOrder._id.toString());

        await session.commitTransaction();
        session.endSession();
        console.log('✅ Transaction committed');

        console.log('========== SUCCESS ==========\n');

        return NextResponse.json({ 
          received: true, 
          orderId: existingOrder._id.toString() 
        }, { status: 200 });

      } catch (txErr) {
        console.error('❌ Transaction failed:', txErr);
        
        await session.abortTransaction();
        session.endSession();

        const msg = txErr instanceof Error ? txErr.message : String(txErr);

        // Update the existing order to failed status
        try {
          existingOrder.status = 'failed';
          existingOrder.items = items;
          existingOrder.subtotal = Number(subtotal.toFixed(2));
          existingOrder.shipping = Number(shipping.toFixed(2));
          existingOrder.total = Number(total.toFixed(2));
          existingOrder.currency = 'gbp';
          existingOrder.metadata = {
            failureReason: msg,
            prices_verified: true,
            webhookEventId: event.id,
            failedAt: new Date().toISOString()
          };
          if (shippingAddress) existingOrder.shippingAddress = shippingAddress;
          if (billingAddress) existingOrder.billingAddress = billingAddress;
          if (client) existingOrder.client = client;
          
          await existingOrder.save();
          console.log('✅ Failed order record updated');
        } catch (e) {
          console.error('❌ Failed to update failed order:', e);
        }

        return new Response('Processing error', { status: 500 });
      }
    }

    console.log('Event type not handled:', event.type);
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return new Response('Webhook handler error', { status: 500 });
  }
}