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
      const billingAddress =
        body['billingAddress'] && typeof body['billingAddress'] === 'object' ? body['billingAddress'] : null;
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
  
      const metadata: Record<string, string> = {
        shipping_saved: 'true',
      };
  
      if (shippingAddress) {
        try {
          metadata.shippingAddress = JSON.stringify(shippingAddress);
        } catch {
          metadata.shippingAddress = '';
        }
      }
  
      // ADD THIS:
      if (billingAddress) {
        try {
          metadata.billingAddress = JSON.stringify(billingAddress);
        } catch {
          metadata.billingAddress = '';
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
        console.log('save-shipping: Shipping and billing data saved to PaymentIntent', paymentIntentId);
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error('save-shipping: Failed to update PaymentIntent:', msg);
        return NextResponse.json({ success: false, message: 'Failed to save shipping to payment' }, { status: 500 });
      }
  
      await dbConnect();
      const existingOrder = (await Order.findOne({ paymentIntentId }).exec()) as OrderDocument | null;
  
      if (existingOrder) {
        let updated = false;
  
        if (shippingAddress) {
          existingOrder.shippingAddress = shippingAddress as Record<string, unknown>;
          updated = true;
        }
  
        // ADD THIS:
        if (billingAddress) {
          existingOrder.billingAddress = billingAddress as Record<string, unknown>;
          updated = true;
        }
  
        if (client) {
          existingOrder.client = client as Record<string, unknown>;
          updated = true;
        }
  
        if (updated) {
          existingOrder.metadata = { ...(existingOrder.metadata ?? {}) };
          (existingOrder.metadata as Record<string, unknown>).shippingConfirmed = true;
  
          await existingOrder.save();
          console.log('save-shipping: Updated existing order', existingOrder._id.toString());
        }
      }
  
      return NextResponse.json({ success: true, message: 'Shipping and billing details saved' }, { status: 200 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('save-shipping error:', message);
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }