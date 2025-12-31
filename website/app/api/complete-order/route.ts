export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import mongoose from 'mongoose';

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  status?: string;
  paymentIntentId?: string;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * This endpoint is a fallback/fast-path for marking shipping as confirmed.
 * The webhook is the PRIMARY processor that creates orders and decrements stock.
 * This endpoint just confirms that shipping info was saved and can provide immediate feedback.
 * 
 * IMPORTANT: This endpoint does NOT create orders or decrement stock anymore.
 * That is handled by the webhook for reliability and consistency.
 * 
 * Called after payment confirmation as a best-effort to mark shipping confirmed,
 * but the webhook remains the canonical source of truth.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({} as Record<string, unknown>));
    const body = typeof raw === 'object' && raw !== null ? raw : {};

    const paymentIntentId = typeof body['paymentIntentId'] === 'string' ? body['paymentIntentId'] : null;

    if (!paymentIntentId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId' }, { status: 400 });
    }

    await dbConnect();

    // Find order by paymentIntentId
    const order = (await Order.findOne({ paymentIntentId }).exec()) as OrderDocument | null;

    // If order doesn't exist yet, it's being created by webhook (or webhook hasn't fired yet)
    // This is fine - shipping was already saved by save-shipping endpoint to PaymentIntent metadata
    // The webhook will create the order with all the data when it processes the payment_intent.succeeded event
    if (!order) {
      console.log('complete-order: Order not found yet for PaymentIntent', paymentIntentId, '(webhook will create it)');
      return NextResponse.json({ 
        success: true, 
        message: 'Payment confirmed, order being processed by webhook' 
      }, { status: 200 });
    }

    // If order exists (webhook already processed), just mark shipping as confirmed
    if (!order.metadata) {
      order.metadata = {};
    }

    (order.metadata as Record<string, unknown>).shippingConfirmed = true;

    try {
      await order.save();
      console.log(`complete-order: Order ${order._id.toString()} shipping confirmed.`);
    } catch (saveErr) {
      // Non-critical error - webhook already created the order successfully
      console.warn('complete-order: Failed to update order (non-critical):', saveErr);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Order confirmed',
      orderId: order._id.toString() 
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('complete-order error:', message);

    // Return success anyway since this is just a fallback
    // The webhook is the source of truth
    return NextResponse.json({ 
      success: true, 
      message: 'Payment processed, order will be created by webhook' 
    }, { status: 200 });
  }
}