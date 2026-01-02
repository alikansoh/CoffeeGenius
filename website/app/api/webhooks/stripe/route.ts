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
import mongoose from 'mongoose';
import { processInvoice } from '@/lib/invoiceService';
import { sendAdminNotification } from '@/lib/notificationService';
import { registerSession, unregisterSession } from '@/lib/sessionMonitor';
import { orderCircuitBreaker } from '@/lib/circuitBreaker';

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
  items?: unknown[];
  status?: string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  client?: Record<string, unknown> | null;
  clientId?: mongoose.Types.ObjectId | string | null;
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
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

interface Item {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  source?: ProductSource;
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
  }>;
  subtotal: number;
  shipping: number;
  total: number;
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

// ============ Helper Functions ============

function asStringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function normalizeAddress(raw: unknown): Address | null {
  if (!raw || typeof raw !== 'object') return null;
  
  const rawObj = raw as Record<string, unknown>;
  const possibleStreetKeys = [
    'line1', 'address', 'address1', 'street', 
    'street1', 'street_address'
  ];
  
  let line1: string | undefined;
  for (const k of possibleStreetKeys) {
    const v = rawObj[k];
    if (typeof v === 'string' && v.trim() !== '') {
      line1 = v.trim();
      break;
    }
  }
  
  const out: Address = {};
  
  // Name fields
  if (typeof rawObj.firstName === 'string') out.firstName = rawObj.firstName;
  if (typeof rawObj.first_name === 'string') out.firstName = rawObj.first_name;
  if (typeof rawObj.firstname === 'string') out.firstName = rawObj.firstname;
  if (typeof rawObj.lastName === 'string') out.lastName = rawObj.lastName;
  if (typeof rawObj.last_name === 'string') out.lastName = rawObj.last_name;
  if (typeof rawObj.lastname === 'string') out.lastName = rawObj.lastname;
  
  // Contact fields
  if (typeof rawObj.email === 'string') out.email = rawObj.email;
  if (typeof rawObj.phone === 'string') out.phone = rawObj.phone;
  
  // Address fields
  if (typeof rawObj.unit === 'string') out.unit = rawObj.unit;
  if (typeof rawObj.flat === 'string') out.unit = rawObj.flat;
  if (typeof rawObj.apartment === 'string') out.unit = rawObj.apartment;
  if (line1) out.line1 = line1;
  if (typeof rawObj.city === 'string') out.city = rawObj.city;
  
  // Postal code
  if (typeof rawObj.postcode === 'string') out.postcode = rawObj.postcode;
  if (typeof rawObj.postalCode === 'string') out.postcode = rawObj.postalCode;
  if (typeof rawObj.postal_code === 'string') out.postcode = rawObj.postal_code;
  
  if (typeof rawObj.country === 'string') out.country = rawObj.country;
  
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
    if (!Number.isFinite(qtyCandidate as number) || (qtyCandidate as number) <= 0) {
      throw new Error(`Item at index ${idx} has invalid qty`);
    }
    if (!Number.isFinite(unitPriceCandidate as number) || (unitPriceCandidate as number) < 0) {
      throw new Error(`Item at index ${idx} has invalid unitPrice`);
    }
    if (!Number.isFinite(totalPriceCandidate as number) || (totalPriceCandidate as number) < 0) {
      throw new Error(`Item at index ${idx} has invalid totalPrice`);
    }
    
    const item: Item = {
      id: idCandidate,
      name: nameCandidate,
      qty: Number(qtyCandidate),
      unitPrice: Number(unitPriceCandidate),
      totalPrice: Number(totalPriceCandidate),
    };
    
    if (sourceCandidate) item.source = sourceCandidate;
    
    return item;
  });
  
  return out;
}

// ✅ Validate financial amounts
function validateFinancials(
  subtotal: number, 
  shipping: number, 
  total: number
): void {
  if (subtotal < 0 || shipping < 0 || total < 0) {
    throw new Error('Negative amounts not allowed');
  }
  
  const calculatedTotal = Number((subtotal + shipping).toFixed(2));
  const actualTotal = Number(total.toFixed(2));
  
  if (Math.abs(calculatedTotal - actualTotal) > 0.01) {
    throw new Error(
      `Total mismatch: ${calculatedTotal} (calculated) !== ${actualTotal} (actual)`
    );
  }
  
  if (total > 1000000) { // £10,000 sanity check
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
    
    // Try by ObjectId first
    if (mongoose.Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, totalStock: { $gte: qty } },
        { $inc: { totalStock: -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }
    
    // Fallback to slug only if ObjectId lookup failed
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
    if (typeof errorObj.code === 'number' && errorObj.code === 112) return true; // WriteConflict
    if (typeof errorObj.hasErrorLabel === 'function') {
      if (errorObj.hasErrorLabel('TransientTransactionError')) return true;
      if (errorObj.hasErrorLabel('UnknownTransactionCommitResult')) return true;
    }
  } catch (e) {
    // ignore detection errors
  }
  return false;
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
    // Check for duplicate invoice
    const existingInvoice = await Invoice.findOne({ paymentIntentId }).exec();
    if (existingInvoice) {
      console.log('⚠️ Invoice already exists for this payment');
      return;
    }
    
    // Save invoice record
    const invoiceCreatedRaw = await Invoice.create({
      source: 'stripe',
      orderId,
      orderNumber: invoiceData.orderNumber,
      items: invoiceData.items,
      subtotal: invoiceData.subtotal,
      shipping: invoiceData.shipping,
      total: invoiceData.total,
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
    
    // Generate PDF and send email
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
      metadata: { webhookEventId: eventId },
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
}

async function upsertClient(
  clientMeta: Record<string, unknown> | null,
  shippingAddress: Address | null
): Promise<ClientDocument | null> {
  try {
    const hasClientMeta = clientMeta !== null;
    
    const fallbackEmail =
      !hasClientMeta && shippingAddress?.email
        ? shippingAddress.email.trim().toLowerCase()
        : undefined;
        
    const emailFromMeta =
      hasClientMeta && typeof clientMeta!.email === 'string' && (clientMeta!.email as string).trim() !== ''
        ? (clientMeta!.email as string).trim().toLowerCase()
        : undefined;
        
    const phoneFromMeta =
      hasClientMeta && typeof clientMeta!.phone === 'string' && (clientMeta!.phone as string).trim() !== ''
        ? (clientMeta!.phone as string).trim()
        : undefined;
        
    const email = emailFromMeta ?? fallbackEmail;
    const phone = phoneFromMeta ?? undefined;
    
    if (!email && !phone && !hasClientMeta) {
      console.log('[Client] No identifiable info - skipping upsert');
      return null;
    }
    
    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    
    if (hasClientMeta && typeof clientMeta!.name === 'string') {
      payload.name = clientMeta!.name;
    } else if (
      hasClientMeta &&
      (typeof clientMeta!.firstName === 'string' || typeof clientMeta!.lastName === 'string')
    ) {
      payload.name = `${(clientMeta!.firstName as string) || ''} ${
        (clientMeta!.lastName as string) || ''
      }`.trim();
    }
    
    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    
    if (hasClientMeta && clientMeta!.address && typeof clientMeta!.address === 'object') {
      payload.address = normalizeAddress(clientMeta!.address);
    } else if (shippingAddress) {
      payload.address = shippingAddress;
    }
    
    payload.metadata = {
      lastSeenFrom: 'stripe-webhook',
      updatedAt: new Date().toISOString(),
    };
    
    // Find existing client by email OR phone
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

// Send apology email to client using Brevo (or other provider)
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
  // Here you can add Slack / PagerDuty / Email notifications for admins
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

    // Prevent duplicate refund attempts by atomically setting refundAttempted
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

    // send apology email if we have client email
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

    // Send admin alert for manual intervention
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
  } catch (err) {
    console.error('❌ Signature verification failed:', err);
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
    
    // Optionally handle refunds/charge updates to sync orders
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
      } catch (e) {
        console.warn('Failed to sync refund/charge event:', e);
      }
    }
    
    console.log('Event type not handled:', event.type);
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    
    // Check circuit breaker message
    if (err instanceof Error && err.message.includes('Circuit breaker is OPEN')) {
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
  
  // Step 1: Create or claim order atomically
  const existingOrderRaw = await Order.findOneAndUpdate(
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
  
  const existingOrder = existingOrderRaw as unknown as OrderDocument | null;
  
  if (!existingOrder) {
    console.error('❌ Upsert unexpectedly returned no order');
    return NextResponse.json({ error: 'Order upsert failed' }, { status: 500 });
  }
  
  // Idempotency: exit only if already successfully paid
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
  
  // Step 2: Fetch latest PaymentIntent metadata (best-effort)
  let latestPI: Stripe.PaymentIntent;
  try {
    latestPI = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log('✅ Retrieved latest PI');
  } catch (err) {
    console.warn('⚠️ Failed to retrieve latest PI:', err);
    latestPI = pi;
  }
  
  const metadata = (latestPI.metadata ?? {}) as Record<string, string>;
  console.log('Metadata keys:', Object.keys(metadata));
  
  // Step 3: Parse and validate data
  const itemsJson = metadata.items ?? '[]';
  const subtotal = parseFloat(metadata.subtotal ?? '') || 0;
  const shipping = parseFloat(metadata.shipping ?? '') || 0;
  const total = parseFloat(metadata.total ?? '') || 0;
  
  console.log('Totals - Subtotal:', subtotal, 'Shipping:', shipping, 'Total:', total);
  
  // Validate financials
  try {
    validateFinancials(subtotal, shipping, total);
    console.log('✅ Financial validation passed');
  } catch (err) {
    console.error('❌ Financial validation failed:', err);
    await saveFailedOrder(existingOrder._id, err, event.id);
    return NextResponse.json({ error: 'Invalid financial data' }, { status: 400 });
  }
  
  // Parse addresses
  let shippingAddressRaw: unknown = null;
  if (metadata.shippingAddress) {
    try {
      shippingAddressRaw = JSON.parse(metadata.shippingAddress);
      console.log('✅ Parsed shipping address');
    } catch (err) {
      console.warn('⚠️ Failed to parse shippingAddress:', err);
    }
  }
  
  let billingAddressRaw: unknown = null;
  if (metadata.billingAddress) {
    try {
      billingAddressRaw = JSON.parse(metadata.billingAddress);
      console.log('✅ Parsed billing address');
    } catch (err) {
      console.warn('⚠️ Failed to parse billingAddress:', err);
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
    } catch (err) {
      console.warn('⚠️ Failed to parse client:', err);
    }
  }
  
  // Step 4: Upsert client
  const clientDoc = await upsertClient(client, shippingAddress);
  
  if (clientDoc) {
    try {
      await Order.findOneAndUpdate(
        { paymentIntentId },
        { $set: { clientId: clientDoc._id } }
      ).exec();
      console.log('[Order] Attached clientId to order');
    } catch (err) {
      console.warn('[Order] Failed to attach clientId (non-fatal):', err);
    }
  }
  
  // Step 5: Parse and validate items
  let items: Item[];
  try {
    const parsedRaw = JSON.parse(itemsJson) as unknown;
    items = validateItems(parsedRaw);
    console.log('✅ Parsed', items.length, 'items');
  } catch (err) {
    console.error('❌ Failed to parse items:', err);
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
  } catch (stockErr) {
    console.error('❌ Stock validation failed:', stockErr);

    const clientEmail =
      (client && typeof client.email === 'string' ? client.email : '') ||
      shippingAddress?.email ||
      '';

    // Initiate refund (idempotent) and notify client/admin
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
    } catch (e) {
      console.error('❌ Error while attempting refund:', e);
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

      // Create timeout wrapper for the transactional work
      const transactionalWork = (async () => {
        const stockChanges: StockChange[] = [];

        console.log(`[TX attempt ${attempt}] Decrementing stock...`);
        for (const item of items) {
          const change = await decrementOneAtomic(session, item);
          stockChanges.push(change);
          console.log(`✅ ${item.name}: ${change.before} → ${change.after}`);
        }

        console.log(`[TX attempt ${attempt}] Updating order...`);
        const updatePayload: Record<string, unknown> = {
          items,
          subtotal: Number(subtotal.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(total.toFixed(2)),
          currency: 'gbp',
          status: 'paid',
          paidAt: new Date(),
          metadata: {
            prices_verified: true,
            stockChanges,
            stockDecremented: true,
            pricedAt: new Date().toISOString(),
            shippingConfirmed: !!shippingAddress,
            webhookEventId: event.id,
            processedAt: new Date().toISOString(),
          },
        };

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

      // Race against transaction timeout
      await Promise.race([
        transactionalWork,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction timeout')), TRANSACTION_TIMEOUT)
        ),
      ]);

      // If we reach here and committed is true, break loop
      if (committed) {
        break;
      }
    } catch (txErr: unknown) {
      finalTxError = txErr;
      console.error(`[TX attempt ${attempt}] Transaction failed:`, txErr);

      // Abort current transaction/session
      if (session) {
        try {
          await safeAbortTransaction(session);
        } catch (abortErr) {
          console.error(`[TX attempt ${attempt}] Abort failed:`, abortErr);
        }
      }

      const transient = isTransientMongoError(txErr);

      if (transient) {
        console.warn(`[TX attempt ${attempt}] Detected transient error. ${attempt < MAX_TX_RETRIES ? 'Retrying...' : 'Max retries reached.'}`);
        if (attempt < MAX_TX_RETRIES) {
          // backoff
          const backoff = TX_BASE_BACKOFF_MS * attempt;
          await new Promise((r) => setTimeout(r, backoff));
          // continue to next attempt
          continue;
        } else {
          // Out of retries: treat as failure below
        }
      } else {
        // Non-transient -> record as final failure
        console.error(`[TX attempt ${attempt}] Non-transient transaction failure, will mark order failed.`);
      }

      // If reached here (either non-transient or out of retries), break the loop to mark failure
      break;
    } finally {
      await safeEndSession(session);
      session = null;
    }
  } // end retry loop

  if (!committed) {
    console.error('❌ All transaction attempts failed.');
    // Don't mark transient errors as failed until we've exhausted retries.
    // finalTxError may be transient or permanent; we've already retried transient ones.
    await saveFailedOrder(existingOrder._id, finalTxError ?? new Error('Unknown transaction failure'), event.id);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  // ===================== POST-PROCESS: INVOICE + ADMIN NOTIFICATIONS =====================

  const companyInfo: CompanyInfo = {
    name: process.env.COMPANY_NAME || 'Your Company Name',
    address: process.env.COMPANY_ADDRESS || '123 Business Street',
    city: process.env.COMPANY_CITY || 'London',
    postcode: process.env.COMPANY_POSTCODE || 'SW1A 1AA',
    country: process.env.COMPANY_COUNTRY || 'United Kingdom',
    email: process.env.COMPANY_EMAIL || 'info@yourcompany.com',
    phone: process.env.COMPANY_PHONE,
    vatNumber: process.env.COMPANY_VAT_NUMBER,
    website: process.env.COMPANY_WEBSITE,
  };
  
  const orderNumber = `INV-${new Date().getFullYear()}-${String(existingOrder._id)
    .slice(-8)
    .toUpperCase()}`;
    
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
    })),
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    total: Number(total.toFixed(2)),
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
  
  // Fire-and-forget invoice processing and admin notification
  processInvoiceAsync(
    invoiceData,
    companyInfo,
    existingOrder._id,
    paymentIntentId,
    event.id
  ).catch((err) => console.error('Background invoice processing failed:', err));
  
  sendAdminNotificationAsync(
    existingOrder._id,
    orderNumber,
    invoiceData,
    total,
    event.id
  ).catch((err) => console.error('Background admin notification failed:', err));
  
  console.log('========== SUCCESS ==========\n');
  
  return NextResponse.json(
    {
      received: true,
      orderId: existingOrder._id.toString(),
    },
    { status: 200 }
  );
}