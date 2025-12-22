'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';

type ValidItem = {
  id: string;
  name: string;
  price: number; // GBP (pounds)
  quantity: number;
};

function parseItems(input: unknown): ValidItem[] {
  if (!Array.isArray(input)) return [];

  return input.map((raw, idx) => {
    if (raw === null || typeof raw !== 'object') {
      throw new Error(`Item at index ${idx} is not an object`);
    }

    const maybe = raw as Record<string, unknown>;

    const id = typeof maybe.id === 'string' ? maybe.id : String(maybe.id ?? '');
    const name = typeof maybe.name === 'string' ? maybe.name : String(maybe.name ?? '');
    const price = Number(maybe.price ?? 0);
    const quantity = Number(maybe.quantity ?? 0);

    if (!id) throw new Error(`Item at index ${idx} is missing a valid 'id'`);
    if (!name) throw new Error(`Item at index ${idx} is missing a valid 'name'`);
    if (!Number.isFinite(price) || price < 0) throw new Error(`Item at index ${idx} has an invalid 'price'`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Item at index ${idx} has an invalid 'quantity'`);

    return { id, name, price, quantity };
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;

    // Expecting { items: [...] }
    const received = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
    const rawItems = received.items;

    const items = parseItems(rawItems);

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items in cart.' }, { status: 400 });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret || stripeSecret.trim() === '') {
      console.error('STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Server not configured (missing STRIPE_SECRET_KEY)' },
        { status: 500 }
      );
    }

    // Use a specific API version string accepted by your Stripe SDK installation.
    // Adjust the apiVersion if you must match a particular Stripe API release.
    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    // subtotal in GBP (pounds)
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    // Shipping rule: free over £30
    const shipping = subtotal > 30 ? 0 : 4.99;

    // Total in GBP
    const total = subtotal + shipping;

    // Amount in pence (smallest currency unit)
    const amount = Math.round(total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_items: JSON.stringify(
          items.map((it) => ({ id: it.id, name: it.name, qty: it.quantity, price: it.price }))
        ),
      },
    });

    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret ?? null,
        amount,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-payment-intent error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}