'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import Client from '@/models/Client';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import Invoice from '@/models/Invoice';
import Settings from '@/models/Settings';
import mongoose from 'mongoose';
import { processInvoice } from '@/lib/invoiceService';
import { sendAdminNotification } from '@/lib/notificationService';
import { notifyTelegramOrder } from '@/lib/notifyTelegramOrder';
import { getNextInvoiceNumber } from '@/lib/getNextInvoiceNumber';
import { registerSession, unregisterSession } from '@/lib/sessionMonitor';
import { orderCircuitBreaker } from '@/lib/circuitBreaker';
import { incrementCouponUsage } from '@/lib/couponService';
import Subscription from '@/models/Subscription';
import { notifySubscriptionManageLink } from '@/lib/notifySubscriptionManage';
import { notifySubscriptionPaymentFailed } from '@/lib/notifySubscriptionPaymentFailed';
import { mintManageToken } from '@/lib/subscriptionManageToken';
import { computeSubscriptionPrice } from '@/lib/subscriptionPricing';
import { notifyAdminNewSubscription } from '@/lib/notifyAdminNewSubscription';
import { notifyTelegramNewSubscription } from '@/lib/notifyTelegramSubscription';

// ============ Types ============
type ProductSource = 'variant' | 'coffee' | 'equipment';

interface ProductDocLean {
  _id?: mongoose.Types.ObjectId | string;
  stock?: number;
  totalStock?: number;
  coffeeId?: mongoose.Types.ObjectId | string;
  slug?: string;
  [k: string]: unknown;
}

interface Address {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  unit?: string;
  line1?: string;
  city?: string;
  postcode?: string;
  country?: string;
  [k: string]: string | undefined;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  items?: Item[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  client?: Record<string, unknown> | null;
  clientId?: mongoose.Types.ObjectId | string | null;
  subtotal?: number;
  discount?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  couponCode?: string | null;
  couponName?: string | null;
  couponId?: string | null;
  metadata?: Record<string, unknown>;
  save(opts?: { session?: mongoose.ClientSession }): Promise<this>;
  [k: string]: unknown;
}

interface ClientDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
  phone?: string;
  address?: Address | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  [k: string]: unknown;
}

interface InvoiceDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  [k: string]: unknown;
}

interface SettingsDocument {
  deliveryPricePence?: number;
  freeDeliveryEnabled?: boolean;
  freeDeliveryThresholdPence?: number;
  [k: string]: unknown;
}

interface Item {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  source?: ProductSource;
  roastType?: string;
  [k: string]: unknown;
}

interface StockChange {
  id: string;
  qty: number;
  source: ProductSource;
  before: number;
  after: number;
}

interface InvoiceData {
  orderId: string;
  orderNumber: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    roastType?: string;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponName?: string | null;
  client: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress: Address | null;
  billingAddress: Address | null;
  paidAt: Date;
  paymentIntentId: string;
}

interface CompanyInfo {
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  email: string;
  phone?: string;
  vatNumber?: string;
  website?: string;
}

interface AdminAlert {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  subject: string;
  orderId: string;
  paymentIntentId: string;
  reason: string;
  error: string;
}

// ============ Configuration ============
const TRANSACTION_TIMEOUT = parseInt(process.env.TRANSACTION_TIMEOUT || '30000', 10);
const ABORT_TIMEOUT = 5000;
const MAX_COMMIT_TIME = 10000;
const MAX_TX_RETRIES = parseInt(process.env.MAX_TX_RETRIES || '3', 10);
const TX_BASE_BACKOFF_MS = 50;

// ============ Error helpers ============
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch {
    return String(err);
  }
}

function getErrorCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const maybe = err as Record<string, unknown>;
  const val = maybe.code ?? maybe.errno ?? maybe.statusCode;
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
  return undefined;
}

// ============ Helper Functions ============
function asStringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function normalizeAddress(raw: unknown): Address | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const getStr = (keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object') {
        const nested = v as Record<string, unknown>;
        for (const nk of ['value', 'text', 'line1', 'address1']) {
          const nv = nested[nk];
          if (typeof nv === 'string' && nv.trim()) return nv.trim();
        }
      }
    }
    return undefined;
  };

  const out: Address = {};

  const line1 = getStr([
    'line1', 'line_1', 'address', 'address1', 'address_line1',
    'street', 'street1', 'street_address', 'address_line_1', 'address_line'
  ]);
  const firstName = getStr(['firstName', 'first_name', 'firstname', 'given_name', 'name', 'fullName']);
  const lastName = getStr(['lastName', 'last_name', 'lastname', 'family_name']);
  const email = getStr(['email', 'email_address', 'emailAddress']);
  const phone = getStr(['phone', 'phoneNumber', 'phone_number', 'telephone', 'mobile']);
  const unit = getStr(['unit', 'flat', 'apartment', 'apt', 'suite']);
  const city = getStr(['city', 'town', 'locality']);
  const postcode = getStr(['postcode', 'postalCode', 'postal_code', 'zip', 'zip_code']);
  const country = getStr(['country', 'country_code', 'countryCode', 'countryName']);

  if (firstName) out.firstName = firstName;
  if (lastName) out.lastName = lastName;
  if (email) out.email = email;
  if (phone) out.phone = phone;
  if (unit) out.unit = unit;
  if (line1) out.line1 = line1;
  if (city) out.city = city;
  if (postcode) out.postcode = postcode;
  if (country) out.country = country;

  if (!out.line1) {
    const possibleCompound = getStr(['address_line', 'formatted_address', 'full_address', 'address_text']);
    if (possibleCompound) out.line1 = possibleCompound;
  }

  return Object.keys(out).length ? out : null;
}

function validateItems(parsed: unknown): Item[] {
  if (!Array.isArray(parsed)) {
    throw new Error('Items must be an array');
  }

  const out: Item[] = parsed.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid item at index ${idx}`);
    }

    const obj = raw as Record<string, unknown>;

    const idCandidate = typeof obj.id === 'string'
      ? obj.id
      : typeof obj._id === 'string'
      ? obj._id
      : undefined;

    const nameCandidate = typeof obj.name === 'string' ? obj.name : undefined;

    const qtyCandidate = typeof obj.qty === 'number'
      ? obj.qty
      : typeof obj.qty === 'string' && obj.qty.trim() !== ''
      ? Number(obj.qty)
      : undefined;

    const unitPriceCandidate = typeof obj.unitPrice === 'number'
      ? obj.unitPrice
      : typeof obj.unitPrice === 'string' && obj.unitPrice.trim() !== ''
      ? Number(obj.unitPrice)
      : undefined;

    const totalPriceCandidate = typeof obj.totalPrice === 'number'
      ? obj.totalPrice
      : typeof obj.totalPrice === 'string' && obj.totalPrice.trim() !== ''
      ? Number(obj.totalPrice)
      : undefined;

    const sourceCandidate = typeof obj.source === 'string' &&
      (obj.source === 'variant' || obj.source === 'coffee' || obj.source === 'equipment')
      ? (obj.source as ProductSource)
      : undefined;

    if (!idCandidate) throw new Error(`Item at index ${idx} missing id`);
    if (!nameCandidate) throw new Error(`Item at index ${idx} missing name`);
    if (!Number.isFinite(qtyCandidate) || (qtyCandidate as number) <= 0) {
      throw new Error(`Item at index ${idx} has invalid qty`);
    }
    if (!Number.isFinite(unitPriceCandidate) || (unitPriceCandidate as number) < 0) {
      throw new Error(`Item at index ${idx} has invalid unitPrice`);
    }
    if (!Number.isFinite(totalPriceCandidate) || (totalPriceCandidate as number) < 0) {
      throw new Error(`Item at index ${idx} has invalid totalPrice`);
    }

    const item: Item = {
      id: idCandidate,
      name: nameCandidate,
      qty: qtyCandidate as number,
      unitPrice: unitPriceCandidate as number,
      totalPrice: totalPriceCandidate as number,
    };

    if (sourceCandidate) item.source = sourceCandidate;

    const roastTypeCandidate = typeof obj.roastType === 'string' && obj.roastType.trim() !== ''
      ? obj.roastType.trim()
      : undefined;
    if (roastTypeCandidate) item.roastType = roastTypeCandidate;

    return item;
  });

  return out;
}

// ✅ Validate financial amounts — now supports discount
function validateFinancials(
  subtotal: number,
  shipping: number,
  total: number,
  discount = 0
): void {
  if (subtotal < 0 || shipping < 0 || total < 0 || discount < 0) {
    throw new Error('Negative amounts not allowed');
  }

  const calculatedTotal = Number((subtotal + shipping - discount).toFixed(2));
  const actualTotal = Number(total.toFixed(2));

  if (Math.abs(calculatedTotal - actualTotal) > 0.01) {
    throw new Error(
      `Total mismatch: ${calculatedTotal} (subtotal + shipping - discount) !== ${actualTotal} (actual)`
    );
  }

  if (total > 1000000) {
    throw new Error('Total amount exceeds reasonable limit');
  }
}

// ✅ Check stock availability WITHOUT locks (pre-check)
async function validateStockAvailability(items: Item[]): Promise<void> {
  for (const item of items) {
    const { id, qty, source = 'variant' } = item;

    let available = 0;

    if (source === 'variant') {
      const variant = await CoffeeVariant.findById(id).select('stock').lean();
      available = variant?.stock || 0;
    } else if (source === 'coffee') {
      const coffee = await Coffee.findById(id).select('stock').lean();
      available = coffee?.stock || 0;
    } else if (source === 'equipment') {
      const equipment = mongoose.Types.ObjectId.isValid(id)
        ? await Equipment.findById(id).select('totalStock').lean()
        : await Equipment.findOne({ slug: id }).select('totalStock').lean();
      available = equipment?.totalStock || 0;
    }

    if (available < qty) {
      throw new Error(
        `Insufficient stock for ${item.name}: available=${available}, requested=${qty}`
      );
    }
  }
}

// ✅ Atomic stock decrement (used in transactional fallback)
async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: ProductSource }
): Promise<StockChange> {
  const { id, qty, source = 'variant' } = item;
  const sessionOpt = session ?? undefined;

  console.log(`[decrementOneAtomic] ${qty}x ${source} id=${id}`);

  if (source === 'variant') {
    const updated = (await CoffeeVariant.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or variant not found for id=${id}`);
    }

    if (updated.coffeeId) {
      await Coffee.findByIdAndUpdate(
        updated.coffeeId,
        { $inc: { totalStock: -qty } },
        { session: sessionOpt }
      ).exec();
    }

    return {
      id,
      qty,
      source,
      before: updated.stock + qty,
      after: updated.stock,
    };
  }

  if (source === 'coffee') {
    const updated = (await Coffee.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or coffee not found for id=${id}`);
    }

    return {
      id,
      qty,
      source,
      before: updated.stock + qty,
      after: updated.stock,
    };
  }

  if (source === 'equipment') {
    let updated: ProductDocLean | null = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, totalStock: { $gte: qty } },
        { $inc: { totalStock: -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }

    if (!updated) {
      updated = (await Equipment.findOneAndUpdate(
        { slug: id, totalStock: { $gte: qty } },
        { $inc: { totalStock: -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }

    if (!updated || typeof updated.totalStock !== 'number') {
      throw new Error(`Insufficient totalStock or equipment not found for id/slug=${id}`);
    }

    return {
      id,
      qty,
      source,
      before: updated.totalStock + qty,
      after: updated.totalStock,
    };
  }

  throw new Error(`Unknown product source for id=${id}`);
}

// ✅ Safe abort transaction with timeout
async function safeAbortTransaction(session: mongoose.ClientSession): Promise<void> {
  if (!session.inTransaction()) {
    console.log('No active transaction to abort');
    return;
  }

  try {
    await Promise.race([
      session.abortTransaction(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Abort timeout')), ABORT_TIMEOUT)
      ),
    ]);
    console.log('✅ Transaction aborted');
  } catch (abortErr) {
    console.error('❌ Failed to abort transaction:', abortErr);
  }
}

// ✅ Safe end session
async function safeEndSession(session: mongoose.ClientSession | null): Promise<void> {
  if (!session) return;

  try {
    unregisterSession(session);
    await session.endSession();
    console.log('✅ Session ended');
  } catch (endErr) {
    console.error('❌ Failed to end session:', endErr);
  }
}

// ✅ Save failed order
async function saveFailedOrder(
  orderId: mongoose.Types.ObjectId,
  error: unknown,
  eventId: string
): Promise<void> {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          status: 'failed',
          'metadata.failureReason': errorMessage,
          'metadata.webhookEventId': eventId,
          'metadata.failedAt': new Date().toISOString(),
        },
      }
    ).exec();

    console.log('✅ Failed order record updated');
  } catch (updateErr) {
    console.error('❌ Failed to update failed order:', updateErr);
  }
}

function isTransientMongoError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const errorObj = err as Record<string, unknown>;
  try {
    if (typeof errorObj.code === 'number' && errorObj.code === 112) return true;
    if (typeof errorObj.hasErrorLabel === 'function') {
      if (errorObj.hasErrorLabel('TransientTransactionError')) return true;
      if (errorObj.hasErrorLabel('UnknownTransactionCommitResult')) return true;
    }
  } catch (e) {
    // ignore detection errors
  }
  return false;
}

// ================= Bounded retries & timeout helpers =================
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelay = 500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = baseDelay * Math.pow(2, i - 1);
      console.warn(`Retry ${i}/${attempts} failed: ${getErrorMessage(err)} — backing off ${backoff}ms`);
      if (i < attempts) await sleep(backoff);
    }
  }
  throw lastErr;
}

// ================= Invoice / Admin / Client Upsert Helpers =================
async function processInvoiceAsync(
  invoiceData: InvoiceData,
  companyInfo: CompanyInfo,
  orderId: mongoose.Types.ObjectId,
  paymentIntentId: string,
  eventId: string
): Promise<void> {
  try {
    const existingInvoice = await Invoice.findOne({ paymentIntentId }).exec();
    if (existingInvoice) {
      console.log('⚠️ Invoice already exists for this payment');
      return;
    }

    const invoiceCreatedRaw = await Invoice.create({
      source: 'stripe',
      orderId,
      orderNumber: invoiceData.orderNumber,
      items: invoiceData.items,
      subtotal: invoiceData.subtotal,
      discount: invoiceData.discount,
      shipping: invoiceData.shipping,
      total: invoiceData.total,
      couponName: invoiceData.couponName,
      currency: 'gbp',
      client: invoiceData.client,
      shippingAddress: invoiceData.shippingAddress,
      billingAddress: invoiceData.billingAddress,
      paidAt: invoiceData.paidAt,
      paymentIntentId,
      sender: {
        email: process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || null,
        name: process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || null,
      },
      recipientEmail: invoiceData.client.email ?? '',
      metadata: {
        createdBy: 'stripe-webhook',
        webhookEventId: eventId,
        processedAt: new Date().toISOString(),
      },
    });

    const invoiceDoc = invoiceCreatedRaw as unknown as InvoiceDocument;

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        'metadata.invoiceSaved': true,
        'metadata.invoiceId': invoiceDoc._id.toString(),
        'metadata.orderNumber': invoiceData.orderNumber,
      },
    }).exec();

    console.log(`✅ Invoice record saved: ${invoiceDoc._id.toString()}`);

    try {
      await processInvoice(invoiceData, companyInfo);

      await Promise.all([
        Invoice.findByIdAndUpdate(invoiceDoc._id, {
          $set: {
            sent: true,
            sentAt: new Date(),
            sendError: null,
          },
        }).exec(),
        Order.findByIdAndUpdate(orderId, {
          $set: {
            'metadata.invoiceSent': true,
            'metadata.invoiceSentAt': new Date().toISOString(),
          },
        }).exec(),
      ]);

      console.log(`✅ Invoice email sent for ${invoiceDoc._id.toString()}`);
    } catch (sendErr) {
      console.error('⚠️ Failed to send invoice email:', sendErr);

      await Promise.all([
        Invoice.findByIdAndUpdate(invoiceDoc._id, {
          $set: {
            sent: false,
            sendError: sendErr instanceof Error ? sendErr.message : String(sendErr),
          },
        }).exec(),
        Order.findByIdAndUpdate(orderId, {
          $set: {
            'metadata.invoiceSent': false,
            'metadata.invoiceError': sendErr instanceof Error ? sendErr.message : String(sendErr),
          },
        }).exec(),
      ]);
    }
  } catch (invoiceErr) {
    console.error('❌ Failed to process invoice:', invoiceErr);

    try {
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          'metadata.invoiceSaved': false,
          'metadata.invoiceError': invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr),
        },
      }).exec();
    } catch (updateErr) {
      console.error('❌ Failed to update order metadata:', updateErr);
    }
  }
}

async function sendAdminNotificationAsync(
  orderId: mongoose.Types.ObjectId,
  orderNumber: string,
  invoiceData: InvoiceData,
  total: number,
  eventId: string
): Promise<void> {
  const adminDashboardUrl = process.env.ADMIN_DASHBOARD_URL
    ? `${process.env.ADMIN_DASHBOARD_URL.replace(/\/$/, '')}/orders/${orderId}`
    : undefined;

  try {
    await sendAdminNotification({
      orderId: orderId.toString(),
      orderNumber,
      total,
      currency: 'gbp',
      clientName: invoiceData.client.name ?? '',
      clientEmail: invoiceData.client.email ?? '',
      items: invoiceData.items,
      dashboardUrl: adminDashboardUrl,
      metadata: {
        webhookEventId: eventId,
        couponName: invoiceData.couponName ?? undefined,
        discount: invoiceData.discount,
      },
    });

    await Promise.all([
      Order.findByIdAndUpdate(orderId, {
        $set: {
          'metadata.adminNotified': true,
          'metadata.adminNotifiedAt': new Date().toISOString(),
        },
      }).exec(),
      Invoice.findOne({ orderId }).then((invoice) => {
        if (invoice) {
          return Invoice.findByIdAndUpdate(invoice._id, {
            $set: {
              'metadata.adminNotified': true,
              'metadata.adminNotifiedAt': new Date().toISOString(),
            },
          }).exec();
        }
      }),
    ]);

    console.log(`✉️ Admin notified for order ${orderId.toString()}`);
  } catch (notifyErr) {
    console.error('⚠️ Failed to send admin notification:', notifyErr);

    try {
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          'metadata.adminNotified': false,
          'metadata.adminNotificationError':
            notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        },
      }).exec();
    } catch (updateErr) {
      console.warn('Failed to update admin notification error:', updateErr);
    }
  }

  // Telegram is best-effort and independent of the email notification above —
  // a failure here should never affect order processing or the email path.
  try {
    const result = await notifyTelegramOrder({
      orderId: orderId.toString(),
      orderNumber,
      total,
      currency: 'gbp',
      clientName: invoiceData.client.name ?? '',
      clientEmail: invoiceData.client.email ?? '',
      items: invoiceData.items,
      dashboardUrl: adminDashboardUrl,
      couponName: invoiceData.couponName ?? undefined,
      discount: invoiceData.discount,
      shippingAddress: invoiceData.shippingAddress,
    });

    if (result.sent) {
      console.log(`📨 Telegram admin notification sent for order ${orderId.toString()}`);
    } else {
      console.warn('⚠️ Telegram admin notification not sent:', result.error);
    }
  } catch (telegramErr) {
    console.warn('⚠️ Telegram admin notification threw:', getErrorMessage(telegramErr));
  }
}

async function upsertClient(
  clientMeta: Record<string, unknown> | null,
  shippingAddress: Address | null
): Promise<ClientDocument | null> {
  try {
    const hasClientMeta = clientMeta !== null;

    const normalizeEmail = (e?: unknown) => {
      if (!e || typeof e !== 'string') return undefined;
      const s = e.trim().toLowerCase();
      return s || undefined;
    };

    const normalizePhone = (p?: unknown) => {
      if (!p || typeof p !== 'string') return undefined;
      const s = p.trim();
      const hasPlus = s.startsWith('+');
      const cleaned = s.replace(/[^\d+]/g, '');
      if (hasPlus) return cleaned || undefined;
      return cleaned.replace(/\+/g, '') || undefined;
    };

    const meta = (clientMeta ?? {}) as Record<string, unknown>;

    const rawEmailFromMeta =
      hasClientMeta && typeof meta.email === 'string' ? meta.email as string : undefined;
    const rawPhoneFromMeta =
      hasClientMeta && typeof meta.phone === 'string' ? meta.phone as string : undefined;
    const rawNameFromMeta =
      hasClientMeta && typeof meta.name === 'string' ? meta.name as string : undefined;

    const rawEmail = rawEmailFromMeta ?? shippingAddress?.email;
    const rawPhone = rawPhoneFromMeta ?? shippingAddress?.phone;

    let rawName = rawNameFromMeta;
    if (!rawName) {
      const fn = (shippingAddress as Record<string, unknown>)?.firstName as string | undefined;
      const ln = (shippingAddress as Record<string, unknown>)?.lastName as string | undefined;
      if (fn || ln) rawName = `${fn ?? ''} ${ln ?? ''}`.trim();
    }
    if (!rawName && hasClientMeta) {
      const fnMeta = meta.firstName as string | undefined;
      const lnMeta = meta.lastName as string | undefined;
      if (fnMeta || lnMeta) rawName = `${fnMeta ?? ''} ${lnMeta ?? ''}`.trim();
    }

    const email = normalizeEmail(rawEmail);
    const phone = normalizePhone(rawPhone);

    if (!email && !phone && !hasClientMeta) {
      console.log('[Client] No identifiable info - skipping upsert');
      return null;
    }

    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
      metadata: {
        lastSeenFrom: 'stripe-webhook',
        updatedAt: new Date().toISOString(),
      },
    };

    if (rawName && typeof rawName === 'string' && rawName.trim()) {
      payload.name = rawName.trim();
    }
    if (email) payload.email = email;
    if (phone) payload.phone = phone;

    try {
      console.log('[Client] Input shippingAddress:', JSON.stringify(shippingAddress, null, 2));

      if (hasClientMeta && meta.address && typeof meta.address === 'object') {
        console.log('[Client] Normalizing address from clientMeta:', JSON.stringify(meta.address, null, 2));
        const normalizedFromMeta = normalizeAddress(meta.address);
        console.log('[Client] Normalized result:', JSON.stringify(normalizedFromMeta, null, 2));
        if (normalizedFromMeta) payload.address = normalizedFromMeta;
      } else if (shippingAddress) {
        console.log('[Client] Normalizing address from shippingAddress:', JSON.stringify(shippingAddress, null, 2));
        const normalizedFromShipping = normalizeAddress(shippingAddress);
        console.log('[Client] Normalized result:', JSON.stringify(normalizedFromShipping, null, 2));
        if (normalizedFromShipping) {
          payload.address = normalizedFromShipping;
        } else {
          console.warn('[Client] ⚠️ Normalization returned null/undefined! Original address:', JSON.stringify(shippingAddress, null, 2));
        }
      }
    } catch (addrErr) {
      console.warn('[Client] Address normalization failed (continuing):', getErrorMessage(addrErr));
    }

    const lookup: Array<Record<string, unknown>> = [];
    if (email) lookup.push({ email });
    if (phone) lookup.push({ phone });

    let existing: ClientDocument | null = null;
    if (lookup.length) {
      const rawExisting = await Client.findOne({ $or: lookup }).exec();
      existing = rawExisting ? (rawExisting as unknown as ClientDocument) : null;
    }

    if (existing) {
      const rawUpdated = await Client.findByIdAndUpdate(
        existing._id,
        { $set: payload },
        { new: true }
      ).exec();
      const clientDoc = rawUpdated ? (rawUpdated as unknown as ClientDocument) : null;
      console.log(`[Client] Merged into existing client ${existing._id.toString()}`);
      console.log(`[Client] Final saved address:`, JSON.stringify(clientDoc?.address, null, 2));
      return clientDoc;
    } else {
      try {
        const metaBase = (payload.metadata as Record<string, unknown>) ?? {};
        const created = await Client.create({
          ...payload,
          metadata: {
            ...metaBase,
            createdBy: 'stripe-webhook',
          },
          createdAt: new Date(),
        });
        const clientDoc = created as unknown as ClientDocument;
        console.log(`[Client] Created new client ${clientDoc._id.toString()}`);
        console.log(`[Client] Final saved address:`, JSON.stringify(clientDoc?.address, null, 2));
        return clientDoc;
      } catch (createErr) {
        console.warn('[Client] Create failed, retrying lookup:', createErr);

        if (email || phone) {
          const retryLookup: Array<Record<string, unknown>> = [];
          if (email) retryLookup.push({ email });
          if (phone) retryLookup.push({ phone });

          const foundRaw = await Client.findOne({ $or: retryLookup }).exec();
          const found = foundRaw ? (foundRaw as unknown as ClientDocument) : null;

          if (found) {
            const mergedRaw = await Client.findByIdAndUpdate(
              found._id,
              { $set: payload },
              { new: true }
            ).exec();
            const clientDoc = mergedRaw ? (mergedRaw as unknown as ClientDocument) : null;
            console.log(`[Client] Found after race: ${found._id.toString()}`);
            console.log(`[Client] Final saved address:`, JSON.stringify(clientDoc?.address, null, 2));
            return clientDoc;
          }
        }

        throw createErr;
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to upsert client:', err);
    return null;
  }
}

// ================= Refund / Notifications =================
async function sendApologyEmail(details: {
  to: string;
  subject: string;
  message: string;
}): Promise<void> {
  const brevoApiKey = process.env.BREVO_API_KEY;

  if (!brevoApiKey) {
    throw new Error('Brevo API key not configured');
  }

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.COMPANY_NAME || 'Your Store',
        email: process.env.BREVO_SENDER_EMAIL || 'noreply@yourstore.com',
      },
      to: [{ email: details.to }],
      subject: details.subject,
      htmlContent: `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #e74c3c;">اعتذار عن إلغاء الطلب</h2>
            <div style="white-space: pre-line; line-height: 1.6;">
              ${details.message}
            </div>
            <hr style="margin: 20px 0;">
            <p style="color: #7f8c8d; font-size: 12px;">
              إذا كان لديك أي استفسار، لا تتردد في التواصل معنا.
            </p>
          </body>
        </html>
      `,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to send email: ${resp.status} ${resp.statusText} ${text}`);
  }
}

// Admin alert stub
async function sendAdminAlert(alert: AdminAlert): Promise<void> {
  console.error('🚨 ADMIN ALERT:', alert);
}

// Refund handler with idempotency & safety checks
async function refundPaymentDueToStockIssue(
  stripe: Stripe,
  paymentIntentId: string,
  orderId: mongoose.Types.ObjectId,
  reason: string,
  clientEmail: string
): Promise<{ refunded?: boolean; refundId?: string; message?: string }> {
  try {
    console.log('💰 Initiating refund due to stock issue...');

    const preMark = await Order.findOneAndUpdate(
      {
        _id: orderId,
        $or: [
          { 'metadata.refundId': { $exists: false } },
          { 'metadata.refundId': '' },
          { 'metadata.refundAttempted': { $exists: false } },
          { 'metadata.refundAttempted': false },
        ],
      },
      {
        $set: {
          'metadata.refundAttempted': true,
          'metadata.refundReason': reason,
          'metadata.refundRequestedAt': new Date().toISOString(),
        },
      },
      { new: true }
    ).exec();

    if (!preMark) {
      console.log('⚠️ Refund already attempted or recorded — skipping new refund');
      return { refunded: false, message: 'Refund already attempted or exists' };
    }

    const idempotencyKey = `refund_${paymentIntentId}_${orderId.toString()}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          orderId: orderId.toString(),
          reason,
          refundedAt: new Date().toISOString(),
        },
      },
      { idempotencyKey }
    );

    console.log('✅ Refund created:', refund.id);

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        status: 'refunded',
        'metadata.refundId': refund.id,
        'metadata.refundReason': reason,
        'metadata.refundedAt': new Date().toISOString(),
      },
    }).exec();

    if (clientEmail) {
      try {
        await sendApologyEmail({
          to: clientEmail,
          subject: 'اعتذار - تم إلغاء طلبك واسترداد المبلغ',
          message: `
عزيزنا العميل،

نعتذر بشدة، ولكن لم نتمكن من إتمام طلبك بسبب نفاد المخزون.

السبب: ${reason}

تم استرداد المبلغ بالكامل إلى حسابك، وسيظهر خلال 5-10 أيام عمل.

رقم الاسترداد: ${refund.id}

نأسف للإزعاج ونتمنى خدمتك قريباً.
          `,
        });
        console.log('📧 Apology email sent');
      } catch (emailErr) {
        console.error('⚠️ Failed to send apology email:', emailErr);
      }
    }

    return { refunded: true, refundId: refund.id };
  } catch (refundErr) {
    console.error('❌ Failed to create refund:', refundErr);

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        status: 'refund_failed',
        'metadata.refundError': refundErr instanceof Error ? refundErr.message : String(refundErr),
        'metadata.refundAttemptedAt': new Date().toISOString(),
      },
    }).exec();

    await sendAdminAlert({
      priority: 'HIGH',
      subject: 'فشل الاسترداد التلقائي - مطلوب تدخل يدوي',
      orderId: orderId.toString(),
      paymentIntentId,
      reason,
      error: refundErr instanceof Error ? refundErr.message : String(refundErr),
    });

    return { refunded: false, message: String(refundErr) };
  }
}

// ================= Route Handlers =================
export async function GET() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  return NextResponse.json({
    status: 'Webhook endpoint is running',
    timestamp: new Date().toISOString(),
    config: {
      webhookSecretConfigured: !!webhookSecret,
      stripeSecretConfigured: !!stripeSecret,
    },
  });
}

/**
 * Keeps our Subscription record's status/period dates in sync whenever
 * Stripe's view of the subscription changes. Idempotent via upsert on
 * stripeSubscriptionId — safe to call from multiple event types.
 */
/**
 * Pulls the Stripe Subscription id off an Invoice. API version 2025-12-15.clover moved this
 * from a top-level `invoice.subscription` field to `invoice.parent.subscription_details.subscription`
 * — same kind of breaking shape change as `payment_intent` -> `confirmation_secret` elsewhere in
 * this file. Checks the new shape first, falls back to the old one in case that ever changes back.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const parentSub = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } } };
    }
  ).parent?.subscription_details?.subscription;
  if (parentSub) {
    return typeof parentSub === 'string' ? parentSub : parentSub.id;
  }

  const legacySub = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (legacySub) {
    return typeof legacySub === 'string' ? legacySub : legacySub.id;
  }

  return undefined;
}

async function syncSubscriptionRecord(stripeSubscription: Stripe.Subscription): Promise<void> {
  await dbConnect();

  const firstItem = stripeSubscription.items.data[0];
  const status: Stripe.Subscription.Status = stripeSubscription.status;

  const mappedStatus =
    status === 'active' || status === 'past_due' || status === 'canceled' || status === 'unpaid'
      ? status
      : status === 'incomplete_expired'
      ? 'canceled'
      : 'incomplete';

  const update: Record<string, unknown> = {
    status: mappedStatus,
    cancelAtPeriodEnd: !!stripeSubscription.cancel_at_period_end,
    currentPeriodStart: firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000)
      : undefined,
    currentPeriodEnd: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : undefined,
  };

  if (mappedStatus === 'canceled') {
    update.canceledAt = stripeSubscription.canceled_at
      ? new Date(stripeSubscription.canceled_at * 1000)
      : new Date();
  }

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSubscription.id },
    { $set: update },
    { upsert: false }
  ).exec();

  console.log(`✅ Subscription ${stripeSubscription.id} synced — status: ${mappedStatus}`);
}

/**
 * Emails the customer their manage-subscription link after every successful payment
 * (initial charge and every renewal). Backfills manageToken on the fly for any
 * subscription record created before that field existed.
 */
async function sendSubscriptionManageLinkEmail(
  stripeSubscriptionId: string,
  billingReason: string | null | undefined
): Promise<void> {
  try {
    await dbConnect();
    const sub = await Subscription.findOne({ stripeSubscriptionId });
    if (!sub || !sub.email) return;

    // Rotate to a fresh token + expiry on every send — a previously emailed link (forwarded,
    // leaked, or just old) stops working the moment a newer one goes out.
    const { token, expiresAt } = mintManageToken();
    sub.manageToken = token;
    sub.manageTokenExpiresAt = expiresAt;
    await sub.save();

    const result = await notifySubscriptionManageLink({
      email: sub.email,
      name: sub.name,
      variantLabel: sub.variantLabel,
      subscriptionPrice: sub.subscriptionPrice,
      frequencyWeeks: sub.frequencyWeeks,
      manageToken: sub.manageToken,
      reason: billingReason === 'subscription_create' ? 'initial' : 'renewal',
      // Only explain the intro pricing while it's still active — once it's reverted, the price
      // shown above already IS the regular price, so there's nothing to explain.
      introOffer:
        sub.introActive && sub.introCyclesLimit
          ? {
              cyclesLimit: sub.introCyclesLimit,
              normalPrice: computeSubscriptionPrice(sub.normalPrice, sub.discountPercent || 0),
            }
          : undefined,
    });

    if (!result.sent) {
      console.warn('⚠️ Failed to send subscription manage-link email:', result.error);
    }
  } catch (err) {
    console.warn('⚠️ Error sending subscription manage-link email:', err);
  }
}

/**
 * Emails the customer when a subscription payment attempt fails — without this, a declined
 * renewal card just silently flips the subscription to past_due/unpaid with nothing telling
 * the customer to fix it before it lapses.
 */
async function sendSubscriptionPaymentFailedEmail(
  stripeSubscriptionId: string,
  nextPaymentAttempt: number | null | undefined
): Promise<void> {
  try {
    await dbConnect();
    const sub = await Subscription.findOne({ stripeSubscriptionId });
    if (!sub || !sub.email) return;

    // Rotate the manage link here too — this may be the customer's first reason to open it
    // in a while, so make sure it's not sitting on a token that's since expired.
    const { token, expiresAt } = mintManageToken();
    sub.manageToken = token;
    sub.manageTokenExpiresAt = expiresAt;
    await sub.save();

    const result = await notifySubscriptionPaymentFailed({
      email: sub.email,
      name: sub.name,
      variantLabel: sub.variantLabel,
      subscriptionPrice: sub.subscriptionPrice,
      frequencyWeeks: sub.frequencyWeeks,
      manageToken: sub.manageToken,
      nextAttemptDate: nextPaymentAttempt ? new Date(nextPaymentAttempt * 1000) : null,
    });

    if (!result.sent) {
      console.warn('⚠️ Failed to send subscription payment-failed email:', result.error);
    }
  } catch (err) {
    console.warn('⚠️ Error sending subscription payment-failed email:', err);
  }
}

/**
 * Notifies the admin (email + Telegram, same channels used for new one-off orders) on every
 * successful subscription payment — the first charge AND every renewal. Renewals matter just
 * as much: there's no automatic Order/fulfilment record for subscription deliveries yet, so
 * this notification is currently the only thing telling admin "this delivery needs packing".
 */
async function notifyAdminOfSubscriptionPayment(
  stripeSubscriptionId: string,
  reason: 'initial' | 'renewal'
): Promise<void> {
  try {
    await dbConnect();
    const sub = await Subscription.findOne({ stripeSubscriptionId }).lean();
    if (!sub) return;

    const adminDashboardUrl = process.env.ADMIN_DASHBOARD_URL
      ? `${process.env.ADMIN_DASHBOARD_URL.replace(/\/$/, '')}/subscriptions`
      : undefined;

    const payload = {
      reason,
      variantLabel: sub.variantLabel,
      subscriptionPrice: sub.subscriptionPrice,
      frequencyWeeks: sub.frequencyWeeks,
      clientName: sub.name ?? undefined,
      clientEmail: sub.email ?? undefined,
      introDiscountPercent: sub.introActive ? sub.introDiscountPercent : undefined,
      introCycles: sub.introActive ? sub.introCyclesLimit : undefined,
      dashboardUrl: adminDashboardUrl,
      shippingAddress: sub.shippingAddress
        ? {
            firstName: sub.shippingAddress.firstName,
            lastName: sub.shippingAddress.lastName,
            line1: sub.shippingAddress.line1,
            unit: sub.shippingAddress.unit,
            city: sub.shippingAddress.city,
            postcode: sub.shippingAddress.postcode,
            country: sub.shippingAddress.country,
            phone: sub.shippingAddress.phone,
          }
        : undefined,
    };

    await notifyAdminNewSubscription(payload);

    const telegramResult = await notifyTelegramNewSubscription(payload);
    if (!telegramResult.sent) {
      console.warn('⚠️ Failed to send subscription-payment Telegram notification:', telegramResult.error);
    }
  } catch (err) {
    console.warn('⚠️ Error notifying admin of subscription payment:', err);
  }
}

/**
 * Creates a fulfilment Order and decrements stock for one subscription delivery — the initial
 * payment AND every renewal. Without this, subscription deliveries never appeared in
 * /admin/orders and never touched inventory, so a subscribed coffee could be oversold and
 * nobody would see the delivery needed packing beyond the admin notification email/Telegram.
 *
 * Idempotent: Stripe can redeliver the same webhook event, so this is keyed off the invoice id
 * (metadata.subscriptionInvoiceId) and no-ops if an Order already exists for it — critical, since
 * running twice would double-decrement stock.
 */
async function fulfilSubscriptionDelivery(
  stripeSubscription: Stripe.Subscription,
  invoice: Stripe.Invoice,
  reason: 'initial' | 'renewal',
  eventId: string,
  stripe: Stripe
): Promise<void> {
  try {
    await dbConnect();

    const existing = await Order.findOne({ 'metadata.subscriptionInvoiceId': invoice.id }).lean();
    if (existing) {
      console.log(`ℹ️ Order already exists for subscription invoice ${invoice.id} — skipping fulfilment`);
      return;
    }

    const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id }).lean();
    if (!sub) {
      console.warn(`⚠️ No local Subscription record for ${stripeSubscription.id} — can't fulfil delivery`);
      return;
    }

    const item = stripeSubscription.items.data[0];
    const qty = item?.quantity && item.quantity > 0 ? item.quantity : 1;
    // Price off what was actually charged on this invoice (pence), not sub.subscriptionPrice —
    // that field can already reflect a post-intro price swap that only applies to future cycles.
    const totalPricePounds = Number(((invoice.amount_paid || 0) / 100).toFixed(2));
    const unitPricePounds = Number((totalPricePounds / qty).toFixed(2));

    try {
      await decrementOneAtomic(null, { id: String(sub.variantId), qty, source: 'variant' });
    } catch (err) {
      // Don't block the order/admin visibility on a stock mismatch — surface it loudly instead.
      // The alternative (silently skipping the Order) would hide a paid delivery from fulfilment.
      console.error(`⚠️ Stock decrement failed for subscription delivery (invoice ${invoice.id}):`, err);
    }

    const orderNumber = await getNextInvoiceNumber();

    const order = await Order.create({
      items: [
        {
          id: String(sub.variantId),
          name: sub.variantLabel,
          qty,
          unitPrice: unitPricePounds,
          totalPrice: totalPricePounds,
          source: 'variant',
        },
      ],
      subtotal: totalPricePounds,
      discount: 0,
      shipping: 0,
      total: totalPricePounds,
      currency: (invoice.currency || 'gbp').toLowerCase(),
      status: 'paid',
      client: {
        name: sub.name,
        email: sub.email,
        phone: sub.phone,
      },
      shippingAddress: sub.shippingAddress
        ? {
            firstName: sub.shippingAddress.firstName,
            lastName: sub.shippingAddress.lastName,
            email: sub.email,
            phone: sub.shippingAddress.phone,
            unit: sub.shippingAddress.unit,
            line1: sub.shippingAddress.line1,
            city: sub.shippingAddress.city,
            postcode: sub.shippingAddress.postcode,
            country: sub.shippingAddress.country,
          }
        : undefined,
      paidAt: new Date(),
      metadata: {
        orderNumber,
        subscriptionId: String(sub._id),
        stripeSubscriptionId: stripeSubscription.id,
        subscriptionInvoiceId: invoice.id,
        subscriptionDeliveryReason: reason,
        source: 'subscription',
      },
    });

    console.log(
      `✅ Created fulfilment Order ${orderNumber} (${order._id}) for subscription ${stripeSubscription.id} — ${reason}`
    );

    // Generate and email the customer their invoice PDF — same pipeline used for one-off
    // orders (processInvoiceAsync/processInvoice), just fed from this subscription delivery
    // instead of a checkout PaymentIntent. `payments` isn't included on the invoice by default
    // in this Stripe API version, so it's fetched explicitly to recover the PaymentIntent id
    // that both the Invoice record's dedupe key and the PDF need.
    try {
      const invoiceWithPayments = await stripe.invoices.retrieve(invoice.id as string, {
        expand: ['payments'],
      });
      const paymentIntentId = invoiceWithPayments.payments?.data?.[0]?.payment?.payment_intent;
      const paymentIntentIdStr =
        typeof paymentIntentId === 'string' ? paymentIntentId : paymentIntentId?.id;

      if (!paymentIntentIdStr) {
        console.warn(`⚠️ No PaymentIntent found on subscription invoice ${invoice.id} — skipping invoice email`);
      } else {
        await processInvoiceAsync(
          {
            orderId: order._id.toString(),
            orderNumber,
            items: [
              {
                name: sub.variantLabel,
                qty,
                unitPrice: unitPricePounds,
                totalPrice: totalPricePounds,
              },
            ],
            subtotal: totalPricePounds,
            discount: 0,
            shipping: 0,
            total: totalPricePounds,
            couponName: undefined,
            client: {
              name: sub.name || '',
              email: sub.email || '',
              phone: sub.phone,
            },
            shippingAddress: sub.shippingAddress
              ? {
                  firstName: sub.shippingAddress.firstName,
                  lastName: sub.shippingAddress.lastName,
                  email: sub.email,
                  phone: sub.shippingAddress.phone,
                  unit: sub.shippingAddress.unit,
                  line1: sub.shippingAddress.line1,
                  city: sub.shippingAddress.city,
                  postcode: sub.shippingAddress.postcode,
                  country: sub.shippingAddress.country,
                }
              : null,
            billingAddress: null,
            paidAt: new Date(),
            paymentIntentId: paymentIntentIdStr,
          },
          buildSubscriptionCompanyInfo(),
          order._id,
          paymentIntentIdStr,
          eventId
        );
      }
    } catch (invoiceErr) {
      console.error(`⚠️ Failed to generate/send invoice for subscription delivery (invoice ${invoice.id}):`, invoiceErr);
    }
  } catch (err) {
    console.error('❌ Error fulfilling subscription delivery:', err);
  }
}

/** Same env-var-driven company details used for one-off order invoices (see the inline
 *  companyInfo block in the PaymentIntent handler) — kept as its own small helper here so
 *  fulfilSubscriptionDelivery doesn't have to duplicate that construction inline. */
function buildSubscriptionCompanyInfo(): CompanyInfo {
  const normalize = (v?: string) => (v ? v.replace(/^"(.*)"$/, '$1').trim() : undefined);
  return {
    name: normalize(process.env.COMPANY_NAME) ?? 'Coffee Genius',
    address: normalize(process.env.COMPANY_ADDRESS) ?? '173 High Street',
    city: normalize(process.env.COMPANY_CITY) ?? 'Staines',
    postcode: normalize(process.env.COMPANY_POSTCODE) ?? 'TW18 4PA',
    country: normalize(process.env.COMPANY_COUNTRY) ?? 'United Kingdom',
    email: normalize(process.env.COMPANY_EMAIL) ?? 'info@coffeegenius.co.uk',
    phone: normalize(process.env.COMPANY_PHONE) ?? undefined,
    vatNumber: normalize(process.env.COMPANY_VAT) ?? undefined,
    website: normalize(process.env.COMPANY_WEBSITE) ?? undefined,
  };
}

/**
 * Called after every paid invoice for a subscription. If a "Subscription Intro Offer" is
 * active on it, counts this as one completed intro cycle and — once the coupon's cycle
 * limit is reached — swaps the subscription onto its normal (non-intro) Price so every
 * future renewal charges the standard subscribe price. proration_behavior: 'none' because
 * the swap should only affect the *next* cycle, not retroactively adjust the one just paid.
 */
async function handleSubscriptionIntroCycle(
  stripeSubscription: Stripe.Subscription,
  stripe: Stripe,
  invoiceId: string
): Promise<void> {
  await dbConnect();

  // Atomic increment, guarded by introLastProcessedInvoiceId, instead of a read-then-write —
  // a plain findOne + save race loses increments when Stripe delivers two invoice.paid events
  // for this subscription close together (e.g. a test clock advancing multiple billing periods
  // at once), and the invoice-id guard stops a Stripe webhook retry from double-counting the
  // same payment as two intro cycles. Both together are why "cycles: 2" could otherwise keep
  // charging the intro price indefinitely instead of reverting after the 2nd delivery.
  const updated = await Subscription.findOneAndUpdate(
    {
      stripeSubscriptionId: stripeSubscription.id,
      introActive: true,
      introCyclesLimit: { $exists: true, $gt: 0 },
      introLastProcessedInvoiceId: { $ne: invoiceId },
    },
    {
      $inc: { introCyclesCompleted: 1 },
      $set: { introLastProcessedInvoiceId: invoiceId },
    },
    { new: true }
  ).exec();

  if (!updated) return; // no active intro offer on this subscription, or this invoice was already counted

  if (updated.introCyclesCompleted < (updated.introCyclesLimit || 0)) {
    console.log(
      `ℹ️ Intro cycle ${updated.introCyclesCompleted}/${updated.introCyclesLimit} for subscription ${updated.stripeSubscriptionId}`
    );
    return;
  }

  // Intro period is over — revert to the normal price for all future renewals. Retried with
  // backoff — a transient Stripe error (e.g. 429 rate limit) here previously meant giving up
  // until the *next* billing cycle before trying again, which for a weekly subscription is a
  // whole week of still being charged the intro price.
  if (updated.stripeSubscriptionItemId && updated.normalStripePriceId) {
    try {
      await retryWithBackoff(() =>
        stripe.subscriptions.update(stripeSubscription.id, {
          items: [{ id: updated.stripeSubscriptionItemId as string, price: updated.normalStripePriceId as string }],
          proration_behavior: 'none',
        })
      );
    } catch (err) {
      console.error('⚠️ Failed to revert subscription off its intro price (after retries):', getErrorMessage(err));
      // Roll back the increment so a later retry can actually complete the revert — otherwise
      // introCyclesCompleted would sit at/above the limit forever with the Stripe price never swapped.
      await Subscription.updateOne(
        { _id: updated._id },
        { $inc: { introCyclesCompleted: -1 }, $unset: { introLastProcessedInvoiceId: '' } }
      ).exec();
      return;
    }
  }

  await Subscription.updateOne(
    { _id: updated._id },
    {
      $set: {
        introActive: false,
        stripePriceId: updated.normalStripePriceId || updated.stripePriceId,
        subscriptionPrice: Number(
          (updated.normalPrice * (1 - (updated.discountPercent || 0) / 100)).toFixed(2)
        ),
      },
    }
  ).exec();

  console.log(`✅ Intro offer ended for subscription ${updated.stripeSubscriptionId} — reverted to normal price`);
}

export async function POST(req: Request) {
  console.log('\n========== WEBHOOK RECEIVED ==========');
  console.log('Timestamp:', new Date().toISOString());

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  console.log('[Config]');
  console.log('- Webhook secret:', webhookSecret ? '✅ Set' : '❌ Missing');
  console.log('- Stripe secret:', stripeSecret ? '✅ Set' : '❌ Missing');

  if (!webhookSecret || !stripeSecret) {
    console.error('❌ Missing Stripe configuration');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2025-12-15.clover',
  });

  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('stripe-signature') ?? '';

  if (!sig) {
    console.error('❌ No signature header');
    return new Response('No signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('✅ Signature verified');
  } catch (err: unknown) {
    console.error('❌ Signature verification failed:', getErrorMessage(err));
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('Event type:', event.type);
  console.log('Event ID:', event.id);

  try {
    if (event.type === 'payment_intent.succeeded') {
      return await orderCircuitBreaker.execute(async () => {
        return await handlePaymentIntentSucceeded(event, stripe);
      });
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.created'
    ) {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionRecord(stripeSubscription);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = extractInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscriptionRecord(stripeSubscription);
        const deliveryReason: 'initial' | 'renewal' =
          invoice.billing_reason === 'subscription_create' ? 'initial' : 'renewal';
        // Fulfil BEFORE the intro-cycle handler — that handler can flip the subscription's
        // stored price to the post-intro rate for future cycles, and this delivery must be
        // priced off what was actually charged on this invoice, not whatever the doc says after.
        await fulfilSubscriptionDelivery(stripeSubscription, invoice, deliveryReason, event.id, stripe);
        await handleSubscriptionIntroCycle(stripeSubscription, stripe, invoice.id as string);
        await sendSubscriptionManageLinkEmail(stripeSubscription.id, invoice.billing_reason);
        await notifyAdminOfSubscriptionPayment(stripeSubscription.id, deliveryReason);
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = extractInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscriptionRecord(stripeSubscription);
        await sendSubscriptionPaymentFailedEmail(stripeSubscription.id, invoice.next_payment_attempt);
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      try {
        const obj = event.data.object as Stripe.Charge | Stripe.Refund;
        const piId = obj.payment_intent as string;
        if (piId) {
          const order = await Order.findOne({ paymentIntentId: piId }).exec();
          if (order) {
            await Order.updateOne(
              { _id: order._id },
              {
                $set: {
                  'metadata.lastStripeEvent': event.type,
                  'metadata.lastStripeEventId': event.id,
                  'metadata.lastStripeEventAt': new Date().toISOString(),
                },
              }
            ).exec();
          }
        }
      } catch (e: unknown) {
        console.warn('Failed to sync refund/charge event:', getErrorMessage(e));
      }
    }

    console.log('Event type not handled:', event.type);
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (err: unknown) {
    console.error('❌ Webhook handler error:', getErrorMessage(err));

    const errMsgLower = getErrorMessage(err).toLowerCase();
    if (errMsgLower.includes('circuit breaker is open')) {
      return new Response('System temporarily unavailable', { status: 503 });
    }

    return new Response('Webhook handler error', { status: 500 });
  }
}

// ================= Main Handler =================
async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  stripe: Stripe
): Promise<NextResponse> {
  console.log('✅ Processing payment_intent.succeeded');

  const pi = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = pi.id;

  console.log('Payment Intent ID:', paymentIntentId);
  console.log('Amount:', pi.amount, 'pence');

  await dbConnect();
  console.log('✅ DB connected');

  // A subscription's recurring invoice is also a PaymentIntent under the hood, so Stripe fires
  // this same event for subscription payments too — those are NOT one-off orders and must never
  // go through the order-creation flow below. They're fully handled by the invoice.paid /
  // customer.subscription.* handlers instead. Check our own records rather than a Stripe field,
  // since the invoice/subscription relationship on PaymentIntent moved across API versions.
  const subscriptionForThisPayment = await Subscription.findOne({
    stripePaymentIntentId: paymentIntentId,
  })
    .select('_id')
    .lean();
  if (subscriptionForThisPayment) {
    console.log('ℹ️ PaymentIntent belongs to a subscription — skipping order processing', {
      paymentIntentId,
    });
    return NextResponse.json({ received: true, subscriptionPayment: true }, { status: 200 });
  }

  let existingOrderRaw: unknown = null;
  try {
    existingOrderRaw = await Order.findOneAndUpdate(
      { paymentIntentId },
      {
        $setOnInsert: {
          paymentIntentId,
          status: 'processing',
          createdAt: new Date(),
          metadata: {
            webhookEventId: event.id,
            processingStarted: new Date().toISOString(),
          },
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  } catch (err: unknown) {
    const code = getErrorCode(err);
    const msg = getErrorMessage(err).toLowerCase();
    if (code === 11000 || code === 11001 || msg.includes('duplicate key')) {
      console.warn('⚠️ Duplicate-key on upsert — reloading existing order for paymentIntentId:', paymentIntentId, 'err:', msg);
      existingOrderRaw = await Order.findOne({ paymentIntentId }).exec();
    } else {
      throw err;
    }
  }

  const existingOrder = existingOrderRaw as unknown as OrderDocument | null;

  if (!existingOrder) {
    console.error('❌ Upsert unexpectedly returned no order');
    return NextResponse.json({ error: 'Order upsert failed' }, { status: 500 });
  }

  if (existingOrder.paidAt) {
    console.log(`✅ Order already processed (paidAt present). OrderId=${existingOrder._id.toString()}`);
    return NextResponse.json(
      {
        received: true,
        message: `Order already processed (paid)`,
        orderId: existingOrder._id.toString(),
      },
      { status: 200 }
    );
  }

  console.log('✅ This webhook will process the order');

  let latestPI: Stripe.PaymentIntent;
  try {
    latestPI = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log('✅ Retrieved latest PI');
  } catch (err: unknown) {
    console.warn('⚠️ Failed to retrieve latest PI:', getErrorMessage(err));
    latestPI = pi;
  }

  const metadata = (latestPI.metadata ?? {}) as Record<string, string>;
  console.log('Metadata keys:', Object.keys(metadata));

  const itemsJson = metadata.items ?? '[]';
  const subtotal = parseFloat(metadata.subtotal ?? '') || 0;
  const metadataShipping = parseFloat(metadata.shipping ?? '') || 0;
  const metadataTotal = parseFloat(metadata.total ?? '') || 0;
  const couponDiscount = parseFloat(metadata.couponDiscount ?? '') || 0;

  console.log(
    'Parsed totals from metadata - Subtotal:',
    subtotal,
    'Shipping(metadata):',
    metadataShipping,
    'Total(metadata):',
    metadataTotal,
    'Discount(coupon):',
    couponDiscount
  );

  const stripeTotal = typeof latestPI.amount === 'number'
    ? Number((latestPI.amount / 100).toFixed(2))
    : NaN;

  let shipping: number;
  let shippingSource: 'stripe' | 'settings' | 'metadata' | 'unknown' = 'unknown';

  if (Number.isFinite(stripeTotal)) {
    const derived = Number((stripeTotal - subtotal + couponDiscount).toFixed(2));
    if (derived < -0.01) {
      const err = new Error(
        `Invalid amounts: Stripe total (${stripeTotal.toFixed(
          2
        )}) is less than subtotal minus discount (${(subtotal - couponDiscount).toFixed(2)})`
      );
      console.error('❌', err.message);
      await saveFailedOrder(existingOrder._id, err, event.id);
      return NextResponse.json({ error: 'Invalid financial data' }, { status: 400 });
    }
    shipping = Math.max(0, derived);
    shippingSource = 'stripe';
    console.log(
      `Shipping derived from Stripe: ${shipping.toFixed(
        2
      )} (stripeTotal ${stripeTotal.toFixed(2)} - subtotal ${subtotal.toFixed(
        2
      )} + discount ${couponDiscount.toFixed(2)})`
    );
  } else {
    try {
      const settingsDoc = await Settings.findOne({}).lean() as SettingsDocument | null;
      if (settingsDoc && typeof settingsDoc.deliveryPricePence === 'number') {
        const deliveryPrice = settingsDoc.deliveryPricePence / 100;
        const freeEnabled = !!settingsDoc.freeDeliveryEnabled;
        const freeThreshold = (settingsDoc.freeDeliveryThresholdPence ?? 0) / 100;
        if (freeEnabled && subtotal >= freeThreshold) {
          shipping = 0;
        } else {
          shipping = deliveryPrice;
        }
        shippingSource = 'settings';
        console.log(`Shipping computed from settings: ${shipping.toFixed(2)}`);
      } else {
        shipping = metadataShipping;
        shippingSource = 'metadata';
        console.log(`Shipping fallback to metadata: ${shipping.toFixed(2)}`);
      }
    } catch (settingsErr: unknown) {
      console.warn('Failed to load settings; falling back to metadata shipping', getErrorMessage(settingsErr));
      shipping = metadataShipping;
      shippingSource = 'metadata';
    }
  }

  console.log('Final shipping used for validation:', shipping);

  const actualTotalToUse = Number.isFinite(stripeTotal) ? stripeTotal : metadataTotal;

  try {
    validateFinancials(subtotal, shipping, actualTotalToUse, couponDiscount);
    console.log('✅ Financial validation passed (using subtotal + shipping - discount)');
  } catch (err: unknown) {
    console.error('❌ Financial validation failed:', getErrorMessage(err));
    await saveFailedOrder(existingOrder._id, err, event.id);
    return NextResponse.json({ error: 'Invalid financial data' }, { status: 400 });
  }

  let shippingAddressRaw: unknown = null;
  if (existingOrder.shippingAddress) {
    shippingAddressRaw = existingOrder.shippingAddress;
    console.log('✅ Loaded shipping address from DB (order record)');
  } else if (metadata.shippingAddress) {
    try {
      shippingAddressRaw = JSON.parse(metadata.shippingAddress);
      console.log('✅ Parsed shipping address from metadata');
    } catch (err: unknown) {
      console.warn('⚠️ Failed to parse shippingAddress from metadata:', getErrorMessage(err));
    }
  }

  let billingAddressRaw: unknown = null;
  if (existingOrder.billingAddress) {
    billingAddressRaw = existingOrder.billingAddress;
    console.log('✅ Loaded billing address from DB (order record)');
  } else if (metadata.billingAddress) {
    try {
      billingAddressRaw = JSON.parse(metadata.billingAddress);
      console.log('✅ Parsed billing address from metadata');
    } catch (err: unknown) {
      console.warn('⚠️ Failed to parse billingAddress from metadata:', getErrorMessage(err));
    }
  }

  const shippingAddress = normalizeAddress(shippingAddressRaw);
  const billingAddress = normalizeAddress(billingAddressRaw);

  let client: Record<string, unknown> | null = null;
  if (metadata.client) {
    try {
      const parsedClient = JSON.parse(metadata.client);
      if (parsedClient && typeof parsedClient === 'object') {
        client = parsedClient as Record<string, unknown>;
        console.log('✅ Parsed client info');
      }
    } catch (err: unknown) {
      console.warn('⚠️ Failed to parse client:', getErrorMessage(err));
    }
  }

  const clientDoc = await upsertClient(client, shippingAddress);

  if (clientDoc) {
    try {
      await Order.findOneAndUpdate(
        { paymentIntentId },
        { $set: { clientId: clientDoc._id } }
      ).exec();
      console.log('[Order] Attached clientId to order');
    } catch (err: unknown) {
      console.warn('[Order] Failed to attach clientId (non-fatal):', getErrorMessage(err));
    }
  }

  let items: Item[];
  try {
    const parsedRaw = JSON.parse(itemsJson) as unknown;
    items = validateItems(parsedRaw);
    console.log('✅ Parsed', items.length, 'items');
  } catch (err: unknown) {
    console.error('❌ Failed to parse items:', getErrorMessage(err));
    await saveFailedOrder(existingOrder._id, err, event.id);
    return NextResponse.json({ error: 'Invalid items metadata' }, { status: 500 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error('❌ No items found');
    await saveFailedOrder(
      existingOrder._id,
      new Error('No items in metadata'),
      event.id
    );
    return NextResponse.json({ error: 'No items in metadata' }, { status: 500 });
  }

  // ===================== STOCK VALIDATION =====================
  try {
    await validateStockAvailability(items);
    console.log('✅ Stock availability confirmed (pre-check)');
  } catch (stockErr: unknown) {
    console.error('❌ Stock validation failed:', getErrorMessage(stockErr));

    const clientEmail =
      (client && typeof client.email === 'string' ? client.email : '') ||
      shippingAddress?.email ||
      '';

    try {
      const refundResult = await refundPaymentDueToStockIssue(
        stripe,
        paymentIntentId,
        existingOrder._id,
        stockErr instanceof Error ? stockErr.message : String(stockErr),
        clientEmail
      );

      await saveFailedOrder(existingOrder._id, stockErr, event.id);

      return NextResponse.json(
        {
          received: true,
          status: refundResult.refunded ? 'refunded' : 'refund_failed',
          message: refundResult.refunded
            ? 'Order cancelled due to insufficient stock. Refund initiated.'
            : `Order cancelled due to insufficient stock. Refund attempt failed: ${refundResult.message}`,
          orderId: existingOrder._id.toString(),
        },
        { status: 200 }
      );
    } catch (e: unknown) {
      console.error('❌ Error while attempting refund:', getErrorMessage(e));
      await saveFailedOrder(existingOrder._id, e, event.id);
      return NextResponse.json({ error: 'Processing error during refund' }, { status: 500 });
    }
  }

  // ================= TRANSACTIONAL DECREMENT WITH RETRIES =================
  console.log('Starting transaction (transactional decrement with retries)...');
  const conn = mongoose.connection;

  let finalTxError: unknown = null;
  let session: mongoose.ClientSession | null = null;
  let committed = false;

  for (let attempt = 1; attempt <= MAX_TX_RETRIES; attempt++) {
    try {
      session = await conn.startSession();
      registerSession(session, paymentIntentId);

      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        maxCommitTimeMS: MAX_COMMIT_TIME,
      });

      const transactionalWork = (async () => {
        const stockChanges: StockChange[] = [];

        console.log(`[TX attempt ${attempt}] Decrementing stock...`);
        for (const item of items) {
          const change = await decrementOneAtomic(session, item);
          stockChanges.push(change);
          console.log(`✅ ${item.name}: ${change.before} → ${change.after}`);
        }

        console.log(`[TX attempt ${attempt}] Preparing order update payload...`);
        const updatePayload: Record<string, unknown> = {
          items,
          subtotal: Number(subtotal.toFixed(2)),
          discount: Number(couponDiscount.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(actualTotalToUse.toFixed(2)),
          currency: 'gbp',
          status: 'paid',
          paidAt: new Date(),
          couponCode: metadata.couponCode || null,
          couponName: metadata.couponName || null,
          couponId: metadata.couponId || null,
          metadata: {
            prices_verified: true,
            stockChanges,
            stockDecremented: true,
            pricedAt: new Date().toISOString(),
            shippingConfirmed: !!shippingAddress,
            shippingSource,
            webhookEventId: event.id,
            processedAt: new Date().toISOString(),
            couponDiscount: couponDiscount.toFixed(2),
          },
        };

        console.log('[TX] shippingAddress (to include):', shippingAddress);
        console.log('[TX] billingAddress (to include):', billingAddress);

        if (shippingAddress) updatePayload.shippingAddress = shippingAddress;
        if (billingAddress) updatePayload.billingAddress = billingAddress;
        if (clientDoc) updatePayload.clientId = clientDoc._id;

        await Order.updateOne(
          { _id: existingOrder._id },
          { $set: updatePayload },
          { session }
        ).exec();

        console.log(`[TX attempt ${attempt}] Committing transaction...`);
        await session!.commitTransaction();
        console.log(`[TX attempt ${attempt}] Transaction committed`);
        committed = true;
      })();

      await Promise.race([
        transactionalWork,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction timeout')), TRANSACTION_TIMEOUT)
        ),
      ]);

      if (committed) {
        break;
      }
    } catch (txErr: unknown) {
      finalTxError = txErr;
      console.error(`[TX attempt ${attempt}] Transaction failed:`, getErrorMessage(txErr));

      if (session) {
        try {
          await safeAbortTransaction(session);
        } catch (abortErr: unknown) {
          console.error(`[TX attempt ${attempt}] Abort failed:`, getErrorMessage(abortErr));
        }
      }

      const transient = isTransientMongoError(txErr);

      if (transient) {
        console.warn(`[TX attempt ${attempt}] Detected transient error. ${attempt < MAX_TX_RETRIES ? 'Retrying...' : 'Max retries reached.'}`);
        if (attempt < MAX_TX_RETRIES) {
          const backoff = TX_BASE_BACKOFF_MS * attempt;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      } else {
        console.error(`[TX attempt ${attempt}] Non-transient transaction failure, will mark order failed.`);
      }

      break;
    } finally {
      await safeEndSession(session);
      session = null;
    }
  }

  if (!committed) {
    console.error('❌ All transaction attempts failed.');
    await saveFailedOrder(existingOrder._id, finalTxError ?? new Error('Unknown transaction failure'), event.id);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  function hasAddressData(addr: Address | null): boolean {
    if (!addr) return false;
    return Object.values(addr).some((v) => typeof v === 'string' && v.trim() !== '');
  }

  try {
    console.log('Persisting addresses to order (post-commit) -- debug step');
    const addrPayload: Record<string, unknown> = {};
    if (hasAddressData(shippingAddress)) addrPayload['shippingAddress'] = shippingAddress;
    if (hasAddressData(billingAddress)) addrPayload['billingAddress'] = billingAddress;

    if (Object.keys(addrPayload).length) {
      await Order.findByIdAndUpdate(existingOrder._id, { $set: addrPayload }).exec();
      const reloaded = await Order.findById(existingOrder._id).lean().exec();
      console.log('Order after saving addresses (post-commit):', {
        shippingAddress: reloaded?.shippingAddress,
        billingAddress: reloaded?.billingAddress,
      });
    } else {
      console.log('No address payload to persist (both normalized to null or empty)');
    }
  } catch (err) {
    console.warn('Failed to persist addresses after commit (debug):', getErrorMessage(err));
  }

  // ===================== POST-COMMIT: RECORD COUPON USAGE =====================
  try {
    const couponId = metadata.couponId;
    const couponEmail =
      metadata.customerEmail ||
      (client && typeof client.email === 'string' ? client.email : undefined) ||
      shippingAddress?.email;

    if (couponId && couponEmail) {
      try {
        await incrementCouponUsage(couponId, couponEmail, existingOrder._id.toString());
        console.log(`✅ Coupon usage recorded: ${couponId} for ${couponEmail}`);

        await Order.findByIdAndUpdate(existingOrder._id, {
          $set: {
            'metadata.couponApplied': couponId,
            'metadata.couponUsageRecorded': true,
            'metadata.couponUsageRecordedAt': new Date().toISOString(),
          },
        }).exec();
      } catch (couponErr) {
        console.error('⚠️ Failed to record coupon usage:', couponErr);

        await Order.findByIdAndUpdate(existingOrder._id, {
          $set: {
            'metadata.couponApplied': couponId,
            'metadata.couponUsageRecorded': false,
            'metadata.couponUsageError':
              couponErr instanceof Error ? couponErr.message : String(couponErr),
          },
        }).exec();
      }
    } else {
      console.log('No coupon metadata present on PaymentIntent — skipping coupon usage recording');
    }
  } catch (err) {
    console.warn('Failed while checking/recording coupon usage (non-fatal):', getErrorMessage(err));
  }

  // ===================== POST-PROCESS: INVOICE + ADMIN NOTIFICATIONS =====================
  function normalizeEnvString(v?: string | undefined) {
    if (!v) return undefined;
    return v.replace(/^"(.*)"$/, "$1").trim();
  }

  const companyInfo: CompanyInfo = {
    name: normalizeEnvString(process.env.COMPANY_NAME) ?? "Coffee Genius",
    address: normalizeEnvString(process.env.COMPANY_ADDRESS) ?? "173 High Street",
    city: normalizeEnvString(process.env.COMPANY_CITY) ?? "Staines",
    postcode: normalizeEnvString(process.env.COMPANY_POSTCODE) ?? "TW18 4PA",
    country: normalizeEnvString(process.env.COMPANY_COUNTRY) ?? "United Kingdom",
    email: normalizeEnvString(process.env.COMPANY_EMAIL) ?? "info@coffeegenius.co.uk",
    phone: normalizeEnvString(process.env.COMPANY_PHONE) ?? undefined,
    vatNumber: normalizeEnvString(process.env.COMPANY_VAT) ?? undefined,
    website: normalizeEnvString(process.env.COMPANY_WEBSITE) ?? undefined,
  };

  // Reuse the invoice number if this webhook is a retry for an order we already numbered,
  // otherwise hand out the next simple sequential number (INV-0001, INV-0002, ...).
  const orderDocForNumber = await Order.findById(existingOrder._id).select('metadata').lean().exec();
  let orderNumber = (orderDocForNumber?.metadata as Record<string, unknown> | undefined)?.orderNumber as
    | string
    | undefined;

  if (!orderNumber) {
    orderNumber = await getNextInvoiceNumber();
    await Order.findByIdAndUpdate(existingOrder._id, {
      $set: { 'metadata.orderNumber': orderNumber },
    }).exec();
  }

  const invoiceClientPhone =
    asStringOrUndefined(clientDoc?.phone) ??
    asStringOrUndefined(client?.phone) ??
    asStringOrUndefined(shippingAddress?.phone);

  const invoiceClient = {
    name:
      (clientDoc && typeof clientDoc.name === 'string'
        ? clientDoc.name
        : client && typeof client.name === 'string'
        ? client.name
        : `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim()) ||
      '',
    email:
      (clientDoc && typeof clientDoc.email === 'string'
        ? clientDoc.email
        : client && typeof client.email === 'string'
        ? client.email
        : shippingAddress?.email) || '',
    phone: invoiceClientPhone,
  };

  const invoiceData: InvoiceData = {
    orderId: existingOrder._id.toString(),
    orderNumber,
    items: items.map((it) => ({
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      roastType: it.roastType,
    })),
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(couponDiscount.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    total: Number(actualTotalToUse.toFixed(2)),
    couponName: metadata.couponName || null,
    client: invoiceClient,
    shippingAddress: shippingAddress
      ? {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address: shippingAddress.line1,
          unit: shippingAddress.unit,
          city: shippingAddress.city,
          postcode: shippingAddress.postcode,
          country: shippingAddress.country,
          email: shippingAddress.email,
          phone: shippingAddress.phone,
        }
      : null,
    billingAddress:
      billingAddress && !(billingAddress as Record<string, unknown>).sameAsShipping
        ? {
            firstName: billingAddress.firstName,
            lastName: billingAddress.lastName,
            address: billingAddress.line1,
            unit: billingAddress.unit,
            city: billingAddress.city,
            postcode: billingAddress.postcode,
            country: billingAddress.country,
          }
        : null,
    paidAt: new Date(),
    paymentIntentId,
  };

  const BG_TIMEOUT_MS = parseInt(process.env.WEBHOOK_NOTIFY_TIMEOUT_MS || '8000', 10);
  const NOTIF_RETRIES = parseInt(process.env.WEBHOOK_NOTIFY_RETRIES || '3', 10);

  try {
    await Order.findByIdAndUpdate(existingOrder._id, {
      $set: {
        'metadata.notificationQueued': true,
        'metadata.notificationQueuedAt': new Date().toISOString(),
        'metadata.notificationMethod': 'inline-webhook-with-retries',
      },
    }).exec();
  } catch (err) {
    console.warn('Failed to mark notificationQueued on order (non-fatal):', getErrorMessage(err));
  }

  const notificationWork = (async () => {
    try {
      await retryWithBackoff(
        () => processInvoiceAsync(invoiceData, companyInfo, existingOrder._id, paymentIntentId, event.id),
        NOTIF_RETRIES,
        500
      );

      await retryWithBackoff(
        () => sendAdminNotificationAsync(existingOrder._id, orderNumber, invoiceData, Number(actualTotalToUse.toFixed(2)), event.id),
        NOTIF_RETRIES,
        500
      );

      try {
        await Order.findByIdAndUpdate(existingOrder._id, {
          $set: {
            'metadata.adminNotified': true,
            'metadata.adminNotifiedAt': new Date().toISOString(),
            'metadata.notificationLastAttemptStatus': 'success',
          },
        }).exec();
      } catch (updateErr) {
        console.warn('Failed to persist notification success metadata:', getErrorMessage(updateErr));
      }

      console.log('✅ Invoice & admin notification completed inline');
    } catch (err) {
      console.error('⚠️ Notification work failed:', getErrorMessage(err));

      try {
        await Order.findByIdAndUpdate(existingOrder._id, {
          $set: {
            'metadata.adminNotified': false,
            'metadata.adminNotificationError': getErrorMessage(err),
            'metadata.notificationLastAttemptAt': new Date().toISOString(),
            'metadata.notificationLastAttemptStatus': 'failed',
          },
        }).exec();
      } catch (updateErr) {
        console.warn('Failed to persist notification failure metadata:', getErrorMessage(updateErr));
      }

      throw err;
    }
  })();

  try {
    await Promise.race([
      notificationWork,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Notification timeout')), BG_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn('Notification did not finish before timeout or failed:', getErrorMessage(err));
    try {
      await Order.findByIdAndUpdate(existingOrder._id, {
        $set: {
          'metadata.notificataionTimedOutAt': new Date().toISOString(),
        },
      }).exec();
    } catch (updateErr) {
      console.warn('Failed to persist notification timeout metadata:', getErrorMessage(updateErr));
    }
  }

  console.log('========== SUCCESS ==========\n');

  return NextResponse.json(
    {
      received: true,
      orderId: existingOrder._id.toString(),
    },
    { status: 200 }
  );
}