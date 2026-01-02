'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';

type ClientItem = { id: string; name: string; price: number; quantity: number };
type VerifiedItem = { id: string; name: string; quantity: number; clientPrice: number; storedPrice: number; source: 'variant' | 'coffee' | 'equipment' };

interface ProductDoc {
  pricePence?: number;
  minPricePence?: number;
  minPrice?: number;
  price?: number;
  name?: string;
  slug?: string;
  stock?: number;
  totalStock?: number;
}

interface StoredLookup {
  price: number;
  source: 'variant' | 'coffee' | 'equipment';
  docName?: string;
}

interface Shortage {
  id: string;
  name: string;
  requested: number;
  available: number;
  source: string;
}

interface ErrorPayload {
  error: string;
  message?: string;
  shortages?: Shortage[];
  serverLog?: string;
}

interface SuccessPayload {
  clientSecret: string | null;
  amount: number;
  paymentIntentId: string;
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
    return Number((pricePence / 100).toFixed(2));
  }

  const price = asNum((doc as ProductDoc).price) ?? asNum((doc as ProductDoc).minPrice);
  if (typeof price === 'number') return Number(price.toFixed(2));

  return 0;
}

async function findStoredPriceForId(id: string): Promise<StoredLookup | null> {
  if (mongoose.Types.ObjectId.isValid(id)) {
    try {
      const variant = (await CoffeeVariant.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (variant) {
        return { price: normalizeDocPriceToGbp(variant), source: 'variant', docName: variant.name };
      }
    } catch {
      // ignore
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

// Returns an array of shortages (empty if all available)
async function validateStockAvailability(verifiedItems: VerifiedItem[]): Promise<Shortage[]> {
  const shortages: Shortage[] = [];

  for (const item of verifiedItems) {
    const { id, quantity, source, name } = item;

    let available = 0;

    if (source === 'variant') {
      const variant = await CoffeeVariant.findById(id).select('stock').lean();
      available = variant?.stock ?? 0;
    } else if (source === 'coffee') {
      const coffee = await Coffee.findById(id).select('stock').lean();
      available = coffee?.stock ?? 0;
    } else if (source === 'equipment') {
      const equipment = mongoose.Types.ObjectId.isValid(id)
        ? await Equipment.findById(id).select('totalStock').lean()
        : await Equipment.findOne({ slug: id }).select('totalStock').lean();
      available = equipment?.totalStock ?? 0;
    }

    if (available < quantity) {
      shortages.push({
        id,
        name,
        requested: quantity,
        available,
        source,
      });
    }
  }

  return shortages;
}

export async function POST(req: Request) {
  // expose details only when enabled intentionally (avoid leaking logs in production)
  const exposeErrors = process.env.NEXT_PUBLIC_EXPOSE_SERVER_ERRORS === 'true' || process.env.NODE_ENV !== 'production';

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawItems = body.items;
    const items = parseItems(rawItems);
    if (items.length === 0) {
      const payload: ErrorPayload = { error: 'No items in cart.' };
      if (exposeErrors) payload.serverLog = 'No items were provided in the create-payment-intent request.';
      return NextResponse.json(payload, { status: 400 });
    }

    const idempotencyKey = (req.headers.get('Idempotency-Key') ?? (body.idempotencyKey as string) ?? null) as string | null;

    await dbConnect();

    // Verify items and prices
    let verifiedItems: VerifiedItem[];
    try {
      verifiedItems = await verifyItems(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Price verification failed:', message);
      const payload: ErrorPayload = { error: `Price verification failed: ${message}` };
      if (exposeErrors) payload.serverLog = `Price verification failed: ${message}`;
      return NextResponse.json(payload, { status: 400 });
    }

    // Check stock availability BEFORE creating PaymentIntent and return structured shortages if any
    const shortages = await validateStockAvailability(verifiedItems);
    if (shortages.length > 0) {
      console.error('❌ Stock validation failed:', shortages);
      // Return structured response so the client can surface item-level stock problems to the user
      const payload: ErrorPayload = {
        error: 'Stock unavailable',
        message: 'One or more items in your cart are out of stock or have insufficient quantity.',
        shortages,
      };
      if (exposeErrors) payload.serverLog = `Stock validation failed: ${JSON.stringify(shortages)}`;
      return NextResponse.json(payload, { status: 409 });
    }
    console.log('✅ Stock availability confirmed (pre-payment check)');

    // Compute totals (use storedPrice)
    const subtotal = verifiedItems.reduce((sum, it) => sum + it.storedPrice * it.quantity, 0);
    const shipping = subtotal > 30 ? 0 : 4.99;
    const total = subtotal + shipping;
    const amount = Math.round(total * 100);

    // Build order items for metadata (compact)
    const orderItems = verifiedItems.map((it) => ({
      id: it.id,
      name: it.name,
      qty: it.quantity,
      unitPrice: it.storedPrice,
      totalPrice: Number((it.storedPrice * it.quantity).toFixed(2)),
      source: it.source,
    }));

    // Create Stripe PaymentIntent
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is not configured');
      const payload: ErrorPayload = { error: 'Server not configured (missing STRIPE_SECRET_KEY)' };
      if (exposeErrors) payload.serverLog = 'Missing STRIPE_SECRET_KEY environment variable';
      return NextResponse.json(payload, { status: 500 });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    // Canonical metadata keys expected by the webhook:
    // items, subtotal, shipping, total
    // Also accept optional shipping and billing payloads from the request and store under:
    // shippingAddress, billingAddress (stringified) — these are optional fallbacks.
    const metadata: Record<string, string> = {
      items: JSON.stringify(orderItems),
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2),
      prices_verified: 'true',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    if (body.shipping) {
      try {
        metadata.shippingAddress = typeof body.shipping === 'string' ? body.shipping : JSON.stringify(body.shipping);
      } catch {}
    }
    if (body.billing) {
      try {
        metadata.billingAddress = typeof body.billing === 'string' ? body.billing : JSON.stringify(body.billing);
      } catch {}
    }
    if (body.client) {
      try {
        metadata.client = typeof body.client === 'string' ? body.client : JSON.stringify(body.client);
      } catch {}
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'gbp',
        automatic_payment_methods: { enabled: true },
        metadata,
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    const payload: SuccessPayload = {
      clientSecret: paymentIntent.client_secret ?? null,
      amount,
      paymentIntentId: paymentIntent.id,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-payment-intent error:', message);
    const exposeErrors = process.env.NEXT_PUBLIC_EXPOSE_SERVER_ERRORS === 'true' || process.env.NODE_ENV !== 'production';
    const payload: ErrorPayload = { error: 'Unable to initialize payment. Please try again later.' };
    if (exposeErrors) payload.serverLog = `create-payment-intent error: ${message}`;
    return NextResponse.json(payload, { status: 500 });
  }
}