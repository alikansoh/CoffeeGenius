'use server';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import mongoose from 'mongoose';

interface ShippingPayload {
  paymentIntentId?: string;
  orderId?: string;
  shippingAddress?: Record<string, unknown> | null;
  client?: Record<string, unknown> | null;
  // allow extra fields
  [k: string]: unknown;
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({} as ShippingPayload));
    const body = typeof raw === 'object' && raw !== null ? (raw as ShippingPayload) : ({} as ShippingPayload);

    const paymentIntentId = typeof body.paymentIntentId === 'string' ? body.paymentIntentId : null;
    const orderId = typeof body.orderId === 'string' ? body.orderId : null;
    const shippingAddress = body.shippingAddress ?? null;
    const client = body.client ?? null;

    if (!paymentIntentId && !orderId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId or orderId' }, { status: 400 });
    }

    await dbConnect();

    // Resolve order
    let order = null;
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).exec();
    }
    if (!order && paymentIntentId) {
      order = await Order.findOne({ paymentIntentId }).exec();
    }

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    // Merge shipping and client into order, mark as provisional (shippingSavedAt)
    order.shippingAddress = {
      ...(order.shippingAddress ?? {}),
      ...(typeof shippingAddress === 'object' && shippingAddress !== null ? shippingAddress : {}),
    };

    order.client = {
      ...(order.client ?? {}),
      ...(typeof client === 'object' && client !== null ? client : {}),
    };

    const meta = order.metadata && typeof order.metadata === 'object' ? { ...(order.metadata as Record<string, unknown>) } : {};
    meta.shippingSavedAt = new Date().toISOString();
    // shippingConfirmed remains false until payment is completed (webhook or complete-order finalizes)
    meta.shippingConfirmed = false;
    order.metadata = meta;

    await order.save();

    return NextResponse.json({ success: true, message: 'Shipping saved (provisional)' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('save-shipping error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}