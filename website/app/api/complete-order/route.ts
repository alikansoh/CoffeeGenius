'use server';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';

interface ProductWithStock {
  stock?: number;
  slug?: string;
  // allow other fields but don't reference them directly
  [k: string]: unknown;
}

type ProductSource = 'variant' | 'coffee' | 'equipment' | string;

interface OrderItem {
  id: string;
  qty: number;
  source?: ProductSource;
}

interface OrderDoc {
  _id: mongoose.Types.ObjectId;
  items?: OrderItem[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  save(opts?: { session?: mongoose.ClientSession } | undefined): Promise<void>;
  // allow other fields
  [k: string]: unknown;
}

async function decrementStock(
  session: mongoose.ClientSession,
  item: { id: string; qty: number; source?: ProductSource }
): Promise<void> {
  const qty = item.qty;
  const id = item.id;
  const src = item.source ?? 'unknown';

  if (src === 'variant') {
    const variant = (await CoffeeVariant.findById(id).session(session).exec()) as unknown as ProductWithStock | null;
    if (!variant) throw new Error(`Variant not found for id=${id}`);
    const available = Number(variant.stock ?? 0);
    if (available < qty) throw new Error(`Insufficient stock for variant id=${id}`);
    variant.stock = available - qty;
    // variant is a plain object from .findById().exec(); call save on the mongoose document instead
    // Re-fetch as a document to save with session
    const variantDoc = await CoffeeVariant.findById(id).session(session).exec();
    if (!variantDoc) throw new Error(`Variant not found for id=${id}`);
    (variantDoc as unknown as { stock?: number }).stock = available - qty;
    await variantDoc.save({ session });
    return;
  }

  if (src === 'coffee') {
    const coffee = (await Coffee.findById(id).session(session).exec()) as unknown as ProductWithStock | null;
    if (!coffee) throw new Error(`Coffee not found for id=${id}`);
    const available = Number(coffee.stock ?? 0);
    if (available < qty) throw new Error(`Insufficient stock for coffee id=${id}`);
    // Re-fetch as document to save
    const coffeeDoc = await Coffee.findById(id).session(session).exec();
    if (!coffeeDoc) throw new Error(`Coffee not found for id=${id}`);
    (coffeeDoc as unknown as { stock?: number }).stock = available - qty;
    await coffeeDoc.save({ session });
    return;
  }

  if (src === 'equipment') {
    let equip = null as ProductWithStock | null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      equip = (await Equipment.findById(id).session(session).exec()) as unknown as ProductWithStock | null;
    }
    if (!equip) {
      equip = (await Equipment.findOne({ slug: id }).session(session).exec()) as unknown as ProductWithStock | null;
    }
    if (!equip) throw new Error(`Equipment not found for id/slug=${id}`);
    const available = Number(equip.stock ?? 0);
    if (available < qty) throw new Error(`Insufficient stock for equipment id=${id}`);
    // Re-fetch as document to save
    let equipDoc = null as (mongoose.Document & { stock?: number }) | null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      equipDoc = (await Equipment.findById(id).session(session).exec()) as unknown as (mongoose.Document & { stock?: number }) | null;
    }
    if (!equipDoc) {
      equipDoc = (await Equipment.findOne({ slug: id }).session(session).exec()) as unknown as (mongoose.Document & { stock?: number }) | null;
    }
    if (!equipDoc) throw new Error(`Equipment not found for id/slug=${id}`);
    equipDoc.stock = available - qty;
    await equipDoc.save({ session });
    return;
  }

  throw new Error(`Unknown product source for id=${id}`);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => ({} as unknown));
    const body = (typeof rawBody === 'object' && rawBody !== null) ? (rawBody as Record<string, unknown>) : {};

    const paymentIntentId = typeof body.paymentIntentId === 'string' ? body.paymentIntentId : null;
    const orderId = typeof body.orderId === 'string' ? body.orderId : null;

    if (!paymentIntentId && !orderId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId or orderId' }, { status: 400 });
    }

    await dbConnect();

    let order: OrderDoc | null = null;
    if (orderId) {
      const found = await Order.findById(orderId).exec();
      order = (found as unknown) as OrderDoc | null;
    }
    if (!order && paymentIntentId) {
      const found = await Order.findOne({ paymentIntentId }).exec();
      order = (found as unknown) as OrderDoc | null;
    }
    if (!order) return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });

    // Optionally verify PaymentIntent status with Stripe
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (stripeSecret && paymentIntentId) {
      const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi && pi.status !== 'succeeded') {
          return NextResponse.json({ success: false, message: 'PaymentIntent not succeeded' }, { status: 400 });
        }
      } catch (err) {
        console.warn('Stripe retrieve error:', err);
        // Proceed — we don't fail hard on Stripe retrieve error here
      }
    }

    // If already paid, nothing to do
    if (order.status === 'paid' || order.status === 'shipped') {
      return NextResponse.json({ success: true, message: 'Order already processed' }, { status: 200 });
    }

    // Ensure items exist and are in expected shape
    const items = Array.isArray(order.items) ? order.items : [];
    const typedItems = items
      .map((it) => {
        if (it && typeof it === 'object') {
          const rec = it as unknown as Record<string, unknown>;
          const id = typeof rec.id === 'string' ? rec.id : String(rec.id ?? '');
          const qty = Number(rec.qty ?? rec.quantity ?? 0);
          const source = typeof rec.source === 'string' ? rec.source : undefined;
          if (!id || !Number.isFinite(qty) || qty <= 0) return null;
          return { id, qty, source } as OrderItem; // Type assertion here
        }
        return null;
      })
      .filter((x): x is OrderItem => x !== null);

    if (typedItems.length === 0) {
      return NextResponse.json({ success: false, message: 'Order contains no valid items' }, { status: 400 });
    }

    // Decrement stock and mark paid in a transaction (best-effort fallback)
    const conn = mongoose.connection;
    const session = await conn.startSession();
    session.startTransaction();
    try {
      for (const it of typedItems) {
        await decrementStock(session, { id: it.id, qty: it.qty, source: it.source });
      }
      // mark order paid
      order.status = 'paid';
      order.paymentIntentId = paymentIntentId ?? order.paymentIntentId;
      order.paidAt = new Date();
      await order.save({ session });
      await session.commitTransaction();
      session.endSession();
      return NextResponse.json({ success: true, message: 'Order marked paid and stock decremented' }, { status: 200 });
    } catch (errInner) {
      await session.abortTransaction();
      session.endSession();
      const msg = errInner instanceof Error ? errInner.message : String(errInner);
      console.error('complete-order transaction failed:', msg);
      // mark order as failed for manual review (best-effort)
      try {
        order.status = 'failed';
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