export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';

type ProductSource = 'variant' | 'coffee' | 'equipment' | string;

interface ProductDocLean {
  _id?: mongoose.Types.ObjectId | string;
  stock?: number;
  coffeeId?: mongoose.Types.ObjectId | string;
  slug?: string;
  [k: string]: unknown;
}

/** Loose local type describing incoming order item shapes we expect to read from the DB.
 * We cast via `unknown` -> `OrderItemLoose` to satisfy the compiler when the runtime
 * type originates from mongoose (IOrderItem) and you want to treat it as a plain object.
 */
type OrderItemLoose = {
  id?: string | mongoose.Types.ObjectId;
  qty?: number;
  quantity?: number;
  source?: ProductSource;
  [k: string]: unknown;
};

/** Atomic decrement helper using findOneAndUpdate so it is safe in concurrent environments */
async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: ProductSource }
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

/**
 * Simplified endpoint: ensure payment succeeded, mark order paid and decrement stock if not already done.
 * Shipping is intentionally NOT modified here — it should have been saved earlier by /api/save-shipping.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({} as Record<string, unknown>));
    const body = typeof raw === 'object' && raw !== null ? raw : {};

    const paymentIntentId = typeof body['paymentIntentId'] === 'string' ? body['paymentIntentId'] : null;
    const orderId = typeof body['orderId'] === 'string' ? body['orderId'] : null;

    if (!paymentIntentId && !orderId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId or orderId' }, { status: 400 });
    }

    await dbConnect();

    // Resolve order by orderId or paymentIntentId
    let order = null;
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).exec();
    }
    if (!order && paymentIntentId) {
      order = await Order.findOne({ paymentIntentId }).exec();
    }

    // Optionally, try to lookup paymentIntent metadata.order_id if stripe key is available and still no order found
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!order && paymentIntentId && stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const metaOrder = pi && typeof pi.metadata === 'object' ? (pi.metadata as Record<string, string>)?.order_id : null;
        if (metaOrder && mongoose.Types.ObjectId.isValid(metaOrder)) {
          order = await Order.findById(metaOrder).exec();
        }
      } catch (e) {
        console.warn('Stripe retrieve failed while resolving order (continuing):', e);
      }
    }

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    // If already processed, return success (idempotent)
    const alreadyProcessed =
      order.status === 'paid' || order.status === 'shipped' || (order.metadata && (order.metadata as Record<string, unknown>).stockDecremented === true);
    if (alreadyProcessed) {
      return NextResponse.json({ success: true, message: 'Order already processed' }, { status: 200 });
    }

    // If Stripe secret is present, verify intent status to avoid marking unpaid orders as paid
    if (paymentIntentId && stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!pi || pi.status !== 'succeeded') {
          return NextResponse.json({ success: false, message: `PaymentIntent status is '${pi?.status ?? 'unknown'}'` }, { status: 400 });
        }
      } catch (e) {
        console.warn('Stripe verify failed (continuing optimistically):', e);
      }
    }

    // Decrement stock and mark paid in a transaction
    const conn = mongoose.connection;
    const session = await conn.startSession();
    session.startTransaction();
    try {
      const items = Array.isArray(order.items) ? order.items : [];
      const stockChanges: Array<{ id: string; qty: number; source?: string; before: number; after: number }> = [];

      if (items.length > 0) {
        for (const rawItem of items) {
          if (!rawItem || typeof rawItem !== 'object') {
            throw new Error('Order contains invalid item');
          }

          // SAFELY treat the raw item as an unknown->local loose type to avoid direct cast from IOrderItem -> Record<string, unknown>
          const it = rawItem as unknown as OrderItemLoose;

          const id =
            typeof it.id === 'string'
              ? it.id
              : typeof it.id === 'object' && (it.id as mongoose.Types.ObjectId).toString
              ? (it.id as mongoose.Types.ObjectId).toString()
              : String(it.id ?? '');

          const qtyRaw = it.qty ?? it.quantity;
          const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw ?? 0);
          const source = typeof it.source === 'string' ? it.source : 'variant';
          if (!id) throw new Error('Order contains item with missing id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Order contains item with invalid qty for id=${id}`);
          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
        }
      }

      // Update order: mark paid and metadata
      const orderInSession = await Order.findById(order._id).session(session).exec();
      if (!orderInSession) throw new Error('Order disappeared during transaction');

      orderInSession.status = 'paid';
      orderInSession.paidAt = orderInSession.paidAt ?? new Date();
      if (paymentIntentId) orderInSession.paymentIntentId = paymentIntentId;

      const metaBase = orderInSession.metadata && typeof orderInSession.metadata === 'object' ? { ...(orderInSession.metadata as Record<string, unknown>) } : {};
      metaBase.stockDecremented = true;
      metaBase.pricedAt = metaBase.pricedAt ?? new Date().toISOString();
      if (stockChanges.length > 0) metaBase.stockChanges = stockChanges;
      // do NOT modify shipping fields here — they're saved by /api/save-shipping

      // Mark shippingConfirmed true because payment has succeeded
      metaBase.shippingConfirmed = true;

      orderInSession.metadata = metaBase;
      await orderInSession.save({ session });

      await session.commitTransaction();
      session.endSession();

      return NextResponse.json({ success: true, message: 'Order marked paid and stock decremented' }, { status: 200 });
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();

      const msg = txErr instanceof Error ? txErr.message : String(txErr);
      console.error('complete-order transaction failed:', msg);

      try {
        order.status = 'failed';
        order.metadata = { ...(order.metadata ?? {}), failureReason: msg };
        await order.save();
      } catch (e) {
        console.error('Failed to mark order failed after transaction error', e);
      }

      return NextResponse.json({ success: false, message: msg }, { status: 500 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('complete-order error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}