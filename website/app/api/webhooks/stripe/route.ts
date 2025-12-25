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

/**
 * Atomically decrement stock for one item.
 * Throws if item not found or insufficient stock.
 */
async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: string }
): Promise<{ id: string; qty: number; source: string; before: number; after: number }> {
  const { id, qty, source = 'variant' } = item;
  const sessionOpt = session ?? undefined;

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

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

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
      const paymentIntentId = pi.id;

      await dbConnect();

      // Check if order already exists for this payment intent (idempotency)
      const order = (await Order.findOne({ paymentIntentId }).exec()) as OrderDocument | null;

      if (order) {
        console.log('Webhook: order already exists for PaymentIntent', paymentIntentId);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // Parse order data from metadata.
      // Be defensive: accept several possible keys (items, items_json, itemsPayload)
      const metadata = pi.metadata && typeof pi.metadata === 'object' ? pi.metadata : {};

      const itemsCandidates = [
        metadata.items,
        metadata.items_json,
        metadata.itemsPayload,
        metadata.itemsPayloadString,
      ];
      let itemsJson = '[]';
      for (const cand of itemsCandidates) {
        if (typeof cand === 'string' && cand.trim()) {
          itemsJson = cand;
          break;
        }
      }

      const subtotal = parseFloat((metadata.subtotal as string) ?? '') || 0;
      const shipping = parseFloat((metadata.shipping as string) ?? '') || 0;
      const total = parseFloat((metadata.total as string) ?? '') || 0;

      // shippingAddress can be named several ways, accept fallbacks
      const shippingAddressCandidates = [
        metadata.shippingAddress,
        metadata.shipping_address,
        metadata.shipping_payload,
        metadata.shippingPayload,
      ];
      let shippingAddressJson: string | null = null;
      for (const s of shippingAddressCandidates) {
        if (typeof s === 'string' && s.trim()) {
          shippingAddressJson = s;
          break;
        }
      }

      // billingAddress fallback keys
      const billingAddressCandidates = [
        metadata.billingAddress,
        metadata.billing_address,
        metadata.billing_payload,
        metadata.billingPayload,
      ];
      let billingAddressJson: string | null = null;
      for (const b of billingAddressCandidates) {
        if (typeof b === 'string' && b.trim()) {
          billingAddressJson = b;
          break;
        }
      }

      // client info
      const clientCandidates = [metadata.client, metadata.customer, metadata.clientInfo];
      let clientJson: string | null = null;
      for (const c of clientCandidates) {
        if (typeof c === 'string' && c.trim()) {
          clientJson = c;
          break;
        }
      }

      let shippingAddress = null;
      if (shippingAddressJson) {
        try {
          shippingAddress = JSON.parse(shippingAddressJson);
        } catch (err) {
          console.warn('Failed to parse shippingAddress from metadata:', err);
          shippingAddress = null;
        }
      }

      let billingAddress = null;
      if (billingAddressJson) {
        try {
          billingAddress = JSON.parse(billingAddressJson);
        } catch (err) {
          console.warn('Failed to parse billingAddress from metadata:', err);
          billingAddress = null;
        }
      }

      let client = null;
      if (clientJson) {
        try {
          client = JSON.parse(clientJson);
        } catch (err) {
          console.warn('Failed to parse client from metadata:', err);
          client = null;
        }
      }

      // Parse items
      let items: Array<{ id: string; name: string; qty: number; unitPrice: number; totalPrice: number; source: string }> = [];
      try {
        items = JSON.parse(itemsJson);
      } catch (err) {
        console.error('Failed to parse items from metadata:', err);
        // When items can't be parsed, we cannot create a proper order -> mark event as received to avoid retries,
        // but log a clear error for debugging
        console.error('Webhook: invalid items metadata for PI', paymentIntentId, 'itemsJson:', itemsJson);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      if (!Array.isArray(items) || items.length === 0) {
        console.warn('Webhook: no items found in PaymentIntent metadata for PI', paymentIntentId);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // Create order and decrement stock in a transaction
      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();

      try {
        const stockChanges: Array<{ id: string; qty: number; source?: string; before: number; after: number }> = [];

        // Decrement stock for each item
        for (const item of items) {
          if (!item || typeof item !== 'object') {
            throw new Error('Order contains invalid item');
          }

          const id = typeof item.id === 'string' ? item.id : String(item.id ?? '');
          const qty = typeof item.qty === 'number' ? item.qty : Number(item.qty ?? 0);
          const source = typeof item.source === 'string' ? item.source : 'variant';

          if (!id) throw new Error('Order contains item with missing id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Order contains item with invalid qty for id=${id}`);

          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
        }

        // Create the order (NOW, after payment succeeded)
        const orderData: Record<string, unknown> = {
          items,
          subtotal: Number(subtotal.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(total.toFixed(2)),
          currency: 'gbp',
          status: 'paid',
          paymentIntentId,
          paidAt: new Date(),
          metadata: {
            prices_verified: true,
            stockChanges,
            stockDecremented: true,
            pricedAt: new Date().toISOString(),
            shippingConfirmed: !!shippingAddress,
          },
        };

        if (shippingAddress) {
          orderData.shippingAddress = shippingAddress;
        }
        if (billingAddress) {
          orderData.billingAddress = billingAddress;
        }
        if (client) {
          orderData.client = client;
        }

        const newOrder = new Order(orderData);
        await newOrder.save({ session });

        await session.commitTransaction();
        session.endSession();

        console.log(`Order ${newOrder._id.toString()} created, marked paid, and stock decremented.`);
        return NextResponse.json({ received: true }, { status: 200 });
      } catch (txErr) {
        await session.abortTransaction();
        session.endSession();

        const msg = txErr instanceof Error ? txErr.message : String(txErr);
        console.error('Error processing payment webhook (transaction aborted):', msg);

        // Create a failed order record for tracking
        try {
          const failedOrderData: Record<string, unknown> = {
            items,
            subtotal: Number(subtotal.toFixed(2)),
            shipping: Number(shipping.toFixed(2)),
            total: Number(total.toFixed(2)),
            currency: 'gbp',
            status: 'failed',
            paymentIntentId,
            metadata: {
              failureReason: msg,
              prices_verified: true,
            },
          };

          if (shippingAddress) {
            failedOrderData.shippingAddress = shippingAddress;
          }

          if (billingAddress) {
            failedOrderData.billingAddress = billingAddress;
          }

          if (client) {
            failedOrderData.client = client;
          }

          await Order.create(failedOrderData);
        } catch (e) {
          console.error('Failed to create failed order record', e);
        }

        return new Response('Processing error', { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Webhook handler error', { status: 500 });
  }
}