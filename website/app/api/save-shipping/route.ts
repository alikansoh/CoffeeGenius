'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

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

    // Fetch the current PaymentIntent so we can merge metadata (avoid accidental overwrites)
    let currentPI: Stripe.PaymentIntent | null = null;
    try {
      currentPI = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('save-shipping: Failed to retrieve PaymentIntent:', msg);
      return NextResponse.json({ success: false, message: 'Failed to retrieve payment intent' }, { status: 500 });
    }

    // Build merged metadata
    const mergedMetadata: Record<string, string> = { ...(currentPI.metadata ?? {}) };

    mergedMetadata.shipping_saved = 'true';
    if (shippingAddress) {
      try {
        mergedMetadata.shippingAddress = JSON.stringify(shippingAddress);
      } catch {
        mergedMetadata.shippingAddress = '';
      }
    }

    if (billingAddress) {
      try {
        mergedMetadata.billingAddress = JSON.stringify(billingAddress);
      } catch {
        mergedMetadata.billingAddress = '';
      }
    }

    if (client) {
      try {
        mergedMetadata.client = JSON.stringify(client);
      } catch {
        mergedMetadata.client = '';
      }
    }

    // Update PI metadata (merge)
    try {
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: mergedMetadata as unknown as Stripe.MetadataParam,
      });
      console.log('save-shipping: Shipping and billing data saved to PaymentIntent', paymentIntentId);
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error('save-shipping: Failed to update PaymentIntent:', msg);
      return NextResponse.json({ success: false, message: 'Failed to save shipping to payment' }, { status: 500 });
    }

    // Update any existing order that already exists (webhook may have processed already)
    await dbConnect();
    const existingOrder = await Order.findOne({ paymentIntentId }).exec();

    if (existingOrder) {
      let updated = false;

      if (shippingAddress) {
        existingOrder.shippingAddress = shippingAddress as Record<string, unknown>;
        updated = true;
      }

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

        try {
          await existingOrder.save();
          console.log('save-shipping: Updated existing order', existingOrder._id.toString());
        } catch (saveErr) {
          console.warn('save-shipping: Failed to update existing order (non-critical):', saveErr);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Shipping and billing details saved' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('save-shipping error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}