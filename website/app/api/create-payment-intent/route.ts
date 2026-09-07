'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import Settings from '@/models/Settings';
import Coupon, { ICoupon } from '@/models/Coupon';
import mongoose from 'mongoose';
import { validateAndApplyCoupon, calculateDiscount, CartItemLike, AppliedCouponResult } from '@/lib/couponService';

interface SettingsDoc {
  deliveryPricePence?: number;
  freeDeliveryEnabled?: boolean;
  freeDeliveryThresholdPence?: number;
}

type ClientItem = { id: string; name: string; price: number; quantity: number; productType?: 'coffee' | 'equipment' };
type VerifiedItem = { id: string; name: string; quantity: number; clientPrice: number; storedPrice: number; source: 'variant' | 'coffee' | 'equipment'; roastType?: string; resolvedProductId: string };

interface ProductDoc {
  pricePence?: number;
  minPricePence?: number;
  minPrice?: number;
  price?: number;
  name?: string;
  slug?: string;
  stock?: number;
  totalStock?: number;
  roastType?: string;
  coffeeId?: mongoose.Types.ObjectId | string;
}

interface StoredLookup {
  price: number;
  source: 'variant' | 'coffee' | 'equipment';
  docName?: string;
  roastType?: string;
  resolvedProductId: string;
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
  discount: number;
  couponName?: string;
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
    const productType = maybe.productType === 'equipment' ? 'equipment' : 'coffee';
    if (!id) throw new Error(`Item at index ${idx} is missing a valid 'id'`);
    if (!name) throw new Error(`Item at index ${idx} is missing a valid 'name'`);
    if (!Number.isFinite(price) || price < 0) throw new Error(`Item at index ${idx} has an invalid 'price'`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Item at index ${idx} has an invalid 'quantity'`);
    return { id, name, price, quantity, productType };
  });
}

function normalizeDocPriceToGbp(doc: ProductDoc | null | undefined): number {
  if (!doc) return 0;
  const asNum = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const pricePence = asNum(doc.pricePence) ?? asNum(doc.minPricePence) ?? asNum(doc.minPrice);
  if (typeof pricePence === 'number') {
    return Number((pricePence / 100).toFixed(2));
  }

  const price = asNum(doc.price) ?? asNum(doc.minPrice);
  if (typeof price === 'number') return Number(price.toFixed(2));

  return 0;
}

async function resolveProductId(id: string, productType?: 'coffee' | 'equipment'): Promise<string> {
  if (productType === 'equipment') {
    const equipById = (await Equipment.findById(id).select('_id').lean().exec()) as { _id: mongoose.Types.ObjectId } | null;
    if (equipById) return equipById._id.toString();

    const equipBySlug = (await Equipment.findOne({ slug: id }).select('_id').lean().exec()) as { _id: mongoose.Types.ObjectId } | null;
    if (equipBySlug) return equipBySlug._id.toString();
    return id;
  }

  if (mongoose.Types.ObjectId.isValid(id)) {
    const variant = (await CoffeeVariant.findById(id).select('coffeeId').lean().exec()) as { coffeeId: mongoose.Types.ObjectId | string } | null;
    if (variant?.coffeeId) return String(variant.coffeeId);

    const coffee = (await Coffee.findById(id).select('_id').lean().exec()) as { _id: mongoose.Types.ObjectId } | null;
    if (coffee) return coffee._id.toString();
  }

  return id;
}

async function findStoredPriceForId(id: string): Promise<StoredLookup | null> {
  if (mongoose.Types.ObjectId.isValid(id)) {
    try {
      const variant = (await CoffeeVariant.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (variant) {
        return {
          price: normalizeDocPriceToGbp(variant),
          source: 'variant',
          docName: variant.name,
          roastType: variant.roastType,
          resolvedProductId: variant.coffeeId ? String(variant.coffeeId) : id,
        };
      }
    } catch {}
    try {
      const coffee = (await Coffee.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (coffee) {
        return { price: normalizeDocPriceToGbp(coffee), source: 'coffee', docName: coffee.name, resolvedProductId: id };
      }
    } catch {}
    try {
      const equip = (await Equipment.findById(id).lean().exec()) as unknown as ProductDoc | null;
      if (equip) {
        return { price: normalizeDocPriceToGbp(equip), source: 'equipment', docName: equip.name, resolvedProductId: id };
      }
    } catch {}
  }

  try {
    const equipBySlug = (await Equipment.findOne({ slug: id }).lean().exec()) as unknown as ProductDoc | null;
    if (equipBySlug) {
      return { price: normalizeDocPriceToGbp(equipBySlug), source: 'equipment', docName: equipBySlug.name, resolvedProductId: id };
    }
  } catch {}

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
    const item: VerifiedItem = { id: it.id, name: lookup.docName ?? it.name, quantity: it.quantity, clientPrice, storedPrice, source: lookup.source, resolvedProductId: lookup.resolvedProductId };
    if (lookup.roastType) item.roastType = lookup.roastType;
    verified.push(item);
  }
  return verified;
}

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
      shortages.push({ id, name, requested: quantity, available, source });
    }
  }
  return shortages;
}

async function findBestAutomaticCoupon(items: CartItemLike[]): Promise<(AppliedCouponResult & { code: string }) | null> {
  const now = new Date();

  const automaticCoupons = await Coupon.find({
    isActive: true,
    isAutomatic: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] },
    ],
  }).lean();

  let bestResult: AppliedCouponResult | null = null;
  let bestCode = '';

  for (const coupon of automaticCoupons) {
    const typedCoupon = coupon as unknown as ICoupon;
    const result = calculateDiscount(items, typedCoupon);

    if (result.valid && result.discountAmount > 0 && (!bestResult || result.discountAmount > bestResult.discountAmount)) {
      bestResult = result;
      bestCode = typedCoupon.code || '';
    }
  }

  if (!bestResult) return null;

  return {
    ...bestResult,
    code: bestCode,
  };
}

export async function POST(req: Request) {
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
    const email = typeof body.email === 'string' ? body.email.trim() : undefined;
    const shippingPenceFromBody = typeof body.shippingPence === 'number' ? body.shippingPence : undefined;

    console.log('[create-payment-intent] email:', email, 'couponCode:', body.couponCode);

    await dbConnect();

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

    const shortages = await validateStockAvailability(verifiedItems);
    if (shortages.length > 0) {
      console.error('❌ Stock validation failed:', shortages);
      const payload: ErrorPayload = {
        error: 'Stock unavailable',
        message: 'One or more items in your cart are out of stock or have insufficient quantity.',
        shortages,
      };
      if (exposeErrors) payload.serverLog = `Stock validation failed: ${JSON.stringify(shortages)}`;
      return NextResponse.json(payload, { status: 409 });
    }
    console.log('✅ Stock availability confirmed (pre-payment check)');

    const subtotal = verifiedItems.reduce((sum, it) => sum + it.storedPrice * it.quantity, 0);

    let shipping = 0;
    if (typeof shippingPenceFromBody === 'number') {
      shipping = Number((shippingPenceFromBody / 100).toFixed(2));
      console.log('[create-payment-intent] shipping from request:', shipping);
    } else {
      try {
        const settingsDoc = await Settings.findOne({}).lean() as SettingsDoc | null;
        if (settingsDoc && typeof settingsDoc.deliveryPricePence === 'number') {
          const deliveryPricePence = settingsDoc.deliveryPricePence ?? 0;
          const freeEnabled = !!settingsDoc.freeDeliveryEnabled;
          const freeThresholdPence = settingsDoc.freeDeliveryThresholdPence ?? 0;

          const deliveryPrice = Number((deliveryPricePence / 100).toFixed(2));
          const freeThreshold = Number((freeThresholdPence / 100).toFixed(2));

          if (freeEnabled && subtotal >= freeThreshold) {
            shipping = 0;
          } else {
            shipping = deliveryPrice;
          }
        } else {
          shipping = subtotal > 30 ? 0 : 4.99;
        }
      } catch {
        shipping = subtotal > 30 ? 0 : 4.99;
      }
    }

    let discount = 0;
    let couponInfo: AppliedCouponResult | null = null;
    const couponCode = body.couponCode as string | undefined;

    const cartItems: CartItemLike[] = verifiedItems.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.storedPrice,
      quantity: it.quantity,
      productType: it.source === 'equipment' ? 'equipment' as const : 'coffee' as const,
      productId: it.resolvedProductId,
      variantId: it.source === 'variant' ? it.id : undefined,
    }));

    console.log('[create-payment-intent] cartItems for coupon:', JSON.stringify(cartItems, null, 2));

    if (couponCode) {
      couponInfo = await validateAndApplyCoupon(cartItems, couponCode, email);

      console.log('[create-payment-intent] validateAndApplyCoupon result:', JSON.stringify(couponInfo, null, 2));

      if (!couponInfo || !couponInfo.valid) {
        const msg = couponInfo?.message || 'Invalid coupon';
        console.warn('[create-payment-intent] manual/auto coupon rejected by validateAndApplyCoupon:', msg);

        const autoFallback = await findBestAutomaticCoupon(cartItems);

        if (autoFallback && autoFallback.code && autoFallback.valid && autoFallback.discountAmount > 0) {
          console.log('[create-payment-intent] using automatic-coupon fallback:', autoFallback.code);
          couponInfo = autoFallback;
          discount = autoFallback.discountAmount;
        } else {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
      } else {
        discount = couponInfo.discountAmount;
      }
    } else {
      try {
        const autoCoupon = await findBestAutomaticCoupon(cartItems);
        console.log('[create-payment-intent] autoCoupon:', JSON.stringify(autoCoupon, null, 2));
        if (autoCoupon) {
          couponInfo = autoCoupon;
          discount = autoCoupon.discountAmount;
        }
      } catch (autoErr) {
        console.error('[create-payment-intent] auto-coupon lookup failed:', autoErr);
      }
    }

    if (discount > subtotal + shipping) {
      discount = Number((subtotal + shipping).toFixed(2));
    }

    const total = Number((subtotal + shipping - discount).toFixed(2));
    const amount = Math.max(0, Math.round(total * 100));

    console.log('[create-payment-intent] subtotal:', subtotal, 'shipping:', shipping, 'discount:', discount, 'total:', total, 'amount:', amount);

    if (amount <= 0) {
      return NextResponse.json({ error: 'Order total must be greater than zero' }, { status: 400 });
    }

    const orderItems = verifiedItems.map((it) => {
      const item: Record<string, unknown> = {
        id: it.id,
        name: it.name,
        qty: it.quantity,
        unitPrice: it.storedPrice,
        totalPrice: Number((it.storedPrice * it.quantity).toFixed(2)),
        source: it.source,
      };
      if (it.roastType) item.roastType = it.roastType;
      return item;
    });

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is not configured');
      const payload: ErrorPayload = { error: 'Server not configured (missing STRIPE_SECRET_KEY)' };
      if (exposeErrors) payload.serverLog = 'Missing STRIPE_SECRET_KEY environment variable';
      return NextResponse.json(payload, { status: 500 });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

    const metadata: Record<string, string> = {
      items: JSON.stringify(orderItems),
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2),
      couponDiscount: discount.toFixed(2),
      prices_verified: 'true',
      customerEmail: email || '',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    if (couponInfo) {
      metadata.couponCode = couponCode || couponInfo.code || '';
      metadata.couponName = couponInfo.name;
      metadata.couponDiscount = discount.toFixed(2);
      metadata.couponId = couponInfo.couponId || '';
    }

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
      discount: Number(discount.toFixed(2)),
      couponName: couponInfo?.name,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-payment-intent error:', message);
    const payload: ErrorPayload = { error: 'Unable to initialize payment. Please try again later.' };
    if (exposeErrors) payload.serverLog = `create-payment-intent error: ${message}`;
    return NextResponse.json(payload, { status: 500 });
  }
}