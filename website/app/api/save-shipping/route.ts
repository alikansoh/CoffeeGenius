export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import mongoose from 'mongoose';

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  paymentIntentId?: string;
  shippingAddress?: Record<string, unknown>;
  client?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  save(): Promise<this>;
  [k: string]: unknown;
}

/**
 * Save shipping details to Stripe PaymentIntent metadata.
 * Since we no longer create orders before payment, we store shipping in PaymentIntent.
 * The webhook will use this data when creating the order after payment succeeds.
 *
 * This endpoint is called BEFORE payment confirmation to ensure shipping data is saved.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({} as Record<string, unknown>));
    const body = typeof raw === 'object' && raw !== null ? raw : {};

    const paymentIntentId = typeof body['paymentIntentId'] === 'string' ? body['paymentIntentId'] : null;
    const shippingAddress =
      body['shippingAddress'] && typeof body['shippingAddress'] === 'object' ? body['shippingAddress'] : null;
    const client = body['client'] && typeof body['client'] === 'object' ? body['client'] : null;

    if (!paymentIntentId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId' }, { status: 400 });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is not configured');
      return NextResponse.json({ success: false, message: 'Server not configured' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    // Build a plain metadata object (string->string) and then assign to Stripe params.
    // Stripe's metadata type can be a union, indexing it directly can cause TS errors,
    // so we construct a simple Record<string,string> first.
    const metadata: Record<string, string> = {
      shipping_saved: 'true',
    };

    if (shippingAddress) {
      try {
        metadata.shippingAddress = JSON.stringify(shippingAddress);
      } catch {
        // Fallback: store minimal or skip if serialization fails
        metadata.shippingAddress = '';
      }
    }

    if (client) {
      try {
        metadata.client = JSON.stringify(client);
      } catch {
        metadata.client = '';
      }
    }

    const updateData: Stripe.PaymentIntentUpdateParams = {
      metadata: metadata as unknown as Stripe.MetadataParam,
    };

    try {
      await stripe.paymentIntents.update(paymentIntentId, updateData);
      console.log('save-shipping: Shipping data saved to PaymentIntent', paymentIntentId);
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error('save-shipping: Failed to update PaymentIntent:', msg);
      return NextResponse.json({ success: false, message: 'Failed to save shipping to payment' }, { status: 500 });
    }

    // Also check if order already exists (in case webhook processed first)
    // This handles race conditions where webhook might create order before this endpoint is called
    await dbConnect();
    const existingOrder = (await Order.findOne({ paymentIntentId }).exec()) as OrderDocument | null;

    if (existingOrder) {
      // Order exists (webhook was faster), update it directly with shipping info
      let updated = false;

      if (shippingAddress) {
        existingOrder.shippingAddress = shippingAddress as Record<string, unknown>;
        updated = true;
      }

      if (client) {
        existingOrder.client = client as Record<string, unknown>;
        updated = true;
      }

      if (updated) {
        // ensure metadata object exists and set a flag
        existingOrder.metadata = { ...(existingOrder.metadata ?? {}) };
        (existingOrder.metadata as Record<string, unknown>).shippingConfirmed = true;

        await existingOrder.save();
        console.log('save-shipping: Updated existing order', existingOrder._id.toString());
      }
    }

    return NextResponse.json({ success: true, message: 'Shipping details saved' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('save-shipping error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}