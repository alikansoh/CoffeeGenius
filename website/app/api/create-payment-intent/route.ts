'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import Order from '@/models/Order';
import mongoose from 'mongoose';

type ClientItem = { id: string; name: string; price: number; quantity: number };
type VerifiedItem = { id: string; name: string; quantity: number; clientPrice: number; storedPrice: number; source: 'variant' | 'coffee' | 'equipment' };

interface ProductDoc {
  // possible numeric price fields (pence or units)
  pricePence?: number;
  minPricePence?: number;
  minPrice?: number;
  price?: number;
  // human-friendly name
  name?: string;
  // slug for equipment lookup
  slug?: string;
  // any other fields are irrelevant for our typing here
}

interface StoredLookup {
  price: number;
  source: 'variant' | 'coffee' | 'equipment';
  docName?: string;
}

interface OrderLean {
  paymentIntentId?: string;
  total: number;
  _id: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  paymentIntentId?: string;
  items?: unknown[];
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  save: () => Promise<this>;
}

function parseItems(input: unknown): ClientItem[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, idx) => {
    if (raw === null || typeof raw !== 'object') throw new Error(`Item at index ${idx} is not an object`);
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

function normalizeDocPriceToGbp(doc: ProductDoc | null | undefined): number {
  if (!doc) return 0;
  const asNum = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const pricePence = asNum((doc as ProductDoc).pricePence) ?? asNum((doc as ProductDoc).minPricePence) ?? asNum((doc as ProductDoc).minPrice);
  if (typeof pricePence === 'number') {
    // pricePence is in pence -> convert to GBP
    return Number((pricePence / 100).toFixed(2));
  }

  const price = asNum((doc as ProductDoc).price) ?? asNum((doc as ProductDoc).minPrice);
  if (typeof price === 'number') return Number(price.toFixed(2));

  return 0;
}

async function findStoredPriceForId(id: string): Promise<StoredLookup | null> {
  // If id looks like a Mongo ObjectId, check by id on variant/coffee/equipment
  if (mongoose.Types.ObjectId.isValid(id)) {
    try {
      const variant = (await CoffeeVariant.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (variant) {
        return { price: normalizeDocPriceToGbp(variant), source: 'variant', docName: variant.name };
      }
    } catch {
      // ignore and continue to other lookups
    }
    try {
      const coffee = (await Coffee.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (coffee) {
        return { price: normalizeDocPriceToGbp(coffee), source: 'coffee', docName: coffee.name };
      }
    } catch {
      // ignore
    }
    try {
      const equip = (await Equipment.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (equip) {
        return { price: normalizeDocPriceToGbp(equip), source: 'equipment', docName: equip.name };
      }
    } catch {
      // ignore
    }
  }

  // fallback: try to find equipment by slug
  try {
    const equipBySlug = (await Equipment.findOne({ slug: id }).lean().exec()) as unknown as ProductDoc | null;
    if (equipBySlug) {
      return { price: normalizeDocPriceToGbp(equipBySlug), source: 'equipment', docName: equipBySlug.name };
    }
  } catch {
    // ignore
  }

  return null;
}

async function verifyItems(items: ClientItem[]): Promise<VerifiedItem[]> {
  const lookups = await Promise.all(items.map((it) => findStoredPriceForId(it.id)));
  const verified: VerifiedItem[] = [];
  const TOLERANCE = 0.01;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const lookup = lookups[i];
    if (!lookup) throw new Error(`Product not found for item id='${it.id}' (name='${it.name}')`);
    const storedPrice = Number(lookup.price ?? 0);
    const clientPrice = Number(it.price ?? 0);
    if (Math.abs(storedPrice - clientPrice) > TOLERANCE) {
      throw new Error(
        `Price mismatch for item id='${it.id}' (name='${it.name}'). Client price=${clientPrice.toFixed(
          2
        )} GBP, stored price=${storedPrice.toFixed(2)} GBP.`
      );
    }
    verified.push({ id: it.id, name: lookup.docName ?? it.name, quantity: it.quantity, clientPrice, storedPrice, source: lookup.source });
  }
  return verified;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawItems = body.items;
    const items = parseItems(rawItems);
    if (items.length === 0) return NextResponse.json({ error: 'No items in cart.' }, { status: 400 });

    // Idempotency key (header preferred, fallback to body.idempotencyKey)
    const idempotencyKey = (req.headers.get('Idempotency-Key') ?? (body.idempotencyKey as string) ?? null) as string | null;

    await dbConnect();

    // If an idempotency key was provided, try to return existing order
    if (idempotencyKey) {
      const existing = (await Order.findOne({ 'metadata.idempotencyKey': idempotencyKey }).lean().exec()) as unknown as OrderLean | null;
      if (existing) {
        // If already has PaymentIntent client_secret stored in metadata, return it
        const existingPI = existing.paymentIntentId ? existing.paymentIntentId : null;
        return NextResponse.json(
          {
            clientSecret: null, // PaymentIntent may not be retrievable easily; client should reuse returned order info
            amount: Math.round(existing.total * 100),
            orderId: existing._id.toString(),
          },
          { status: 200 }
        );
      }
    }

    // Verify items and prices
    let verifiedItems: VerifiedItem[];
    try {
      verifiedItems = await verifyItems(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Price verification failed:', message);
      return NextResponse.json({ error: `Price verification failed: ${message}` }, { status: 400 });
    }

    // Compute totals (use storedPrice)
    const subtotal = verifiedItems.reduce((sum, it) => sum + it.storedPrice * it.quantity, 0);
    const shipping = subtotal > 30 ? 0 : 4.99;
    const total = subtotal + shipping;
    const amount = Math.round(total * 100);

    // Build order items
    const orderItems = verifiedItems.map((it) => ({
      id: it.id,
      name: it.name,
      qty: it.quantity,
      unitPrice: it.storedPrice,
      totalPrice: Number((it.storedPrice * it.quantity).toFixed(2)),
      source: it.source,
    }));

    // Create pending order (with idempotency metadata when provided)
    const orderDoc = (await Order.create({
      items: orderItems,
      subtotal: Number(subtotal.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      total: Number(total.toFixed(2)),
      currency: 'gbp',
      status: 'pending',
      metadata: { prices_verified: true, ...(idempotencyKey ? { idempotencyKey } : {}) },
    })) as unknown as OrderDocument;

    // Create Stripe PaymentIntent; pass orderId in metadata; use Stripe idempotency via options if idempotencyKey provided
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is not configured');
      return NextResponse.json({ error: 'Server not configured (missing STRIPE_SECRET_KEY)' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'gbp',
        automatic_payment_methods: { enabled: true },
        metadata: {
          order_id: orderDoc._id.toString(),
          prices_verified: 'true',
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    // Save paymentIntent id on the order document
    orderDoc.paymentIntentId = paymentIntent.id;
    await orderDoc.save();

    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret ?? null,
        amount,
        orderId: orderDoc._id.toString(),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-payment-intent error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}