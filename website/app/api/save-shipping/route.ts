'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';

// Helper: ensure value is parsed object if JSON string
function parseMaybeJson(obj: unknown): unknown {
  if (typeof obj === 'string') {
    try {
      return JSON.parse(obj);
    } catch {
      return obj;
    }
  }
  return obj;
}

// Helper: truncate metadata values to Stripe-friendly length (500 chars per value)
function truncateForStripe(s: string, max = 500) {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({} as Record<string, unknown>));
    const body = typeof raw === 'object' && raw !== null ? raw : {};

    const paymentIntentId = typeof body['paymentIntentId'] === 'string' ? body['paymentIntentId'] : null;
    if (!paymentIntentId) {
      return NextResponse.json({ success: false, message: 'Missing paymentIntentId' }, { status: 400 });
    }

    // Allow shipping/billing provided as objects OR JSON strings
    const shippingAddressRaw = parseMaybeJson(body['shippingAddress']);
    const billingAddressRaw = parseMaybeJson(body['billingAddress']);
    const clientRaw = parseMaybeJson(body['client']);

    // Validate minimal shape here (you can expand to stronger checks)
    const shippingAddress = typeof shippingAddressRaw === 'object' && shippingAddressRaw !== null ? (shippingAddressRaw as Record<string, unknown>) : null;
    const billingAddress = typeof billingAddressRaw === 'object' && billingAddressRaw !== null ? (billingAddressRaw as Record<string, unknown>) : null;
    const client = typeof clientRaw === 'object' && clientRaw !== null ? (clientRaw as Record<string, unknown>) : null;

    await dbConnect();

    // Upsert or attach to order in DB FIRST — do not let Stripe metadata error abort DB save
    let order = await Order.findOne({ paymentIntentId }).exec();
    if (!order) {
      order = await Order.create({
        paymentIntentId,
        status: 'processing',
        createdAt: new Date(),
        metadata: { shippingSavedAt: new Date().toISOString() },
      });
    }

    let updated = false;
    if (shippingAddress) {
      order.shippingAddress = shippingAddress;
      updated = true;
    }
    if (billingAddress) {
      order.billingAddress = billingAddress;
      updated = true;
    }
    if (client) {
      order.client = client;
      updated = true;
    }

    if (updated) {
      order.metadata = { ...(order.metadata ?? {}) };
      order.metadata.shippingConfirmed = true;
      order.metadata.shippingSavedAt = new Date().toISOString();
      await order.save();
      console.log('save-shipping: saved addresses to DB for order', order._id?.toString());
    } else {
      console.log('save-shipping: nothing to update on order', order._id?.toString());
    }

    // Now try to update Stripe metadata, but do not fail the endpoint if Stripe rejects it.
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.warn('STRIPE_SECRET_KEY not configured — skipping Stripe metadata update');
      return NextResponse.json({ success: true, message: 'Saved to DB; stripe not configured' }, { status: 200 });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    // Build minimal metadata: keep it small. Do NOT put huge JSON blobs into metadata.
    const metadata: Record<string, string> = {
      shipping_saved: 'true',
    };
    if (shippingAddress) {
      try {
        metadata.shipping_summary = truncateForStripe(JSON.stringify({
          line1: shippingAddress.line1,
          city: shippingAddress.city,
          postcode: shippingAddress.postcode,
          country: shippingAddress.country,
          email: shippingAddress.email,
        }));
      } catch {
        metadata.shipping_summary = '';
      }
    }
    if (billingAddress) {
      try {
        metadata.billing_summary = truncateForStripe(JSON.stringify({
          line1: billingAddress.line1,
          city: billingAddress.city,
          postcode: billingAddress.postcode,
          country: billingAddress.country,
        }));
      } catch {
        metadata.billing_summary = '';
      }
    }
    if (client && client.email) {
      metadata.client_email = String(client.email).slice(0, 200);
    }

    // Try update but don't propagate Stripe error to the client
    try {
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: metadata as unknown as Stripe.MetadataParam,
      });
      console.log('save-shipping: updated Stripe PI metadata (non-blocking)');
    } catch (stripeErr) {
      console.error('save-shipping: Stripe metadata update failed (non-fatal):', stripeErr instanceof Error ? stripeErr.message : String(stripeErr));
      // record that stripe update failed for later reconciliation
      try {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'metadata.stripeMetadataSaved': false,
            'metadata.stripeMetadataError': stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
            'metadata.stripeMetadataAttemptedAt': new Date().toISOString(),
          },
        }).exec();
      } catch (metaErr) {
        console.warn('save-shipping: failed to persist stripe metadata failure on order:', metaErr);
      }
    }

    return NextResponse.json({ success: true, message: 'Shipping and billing details saved' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('save-shipping error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}