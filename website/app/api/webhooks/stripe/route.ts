'use server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import Client from '@/models/Client';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';
import { processInvoice } from '@/lib/invoiceService';
import Invoice from '@/models/Invoice';
import { sendAdminNotification } from '@/lib/notificationService';

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

function asStringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty: number; source?: ProductSource }
): Promise<{ id: string; qty: number; source: ProductSource; before: number; after: number }> {
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
      await Coffee.findByIdAndUpdate(updated.coffeeId, { $inc: { totalStock: -qty } }, { session: sessionOpt }).exec();
    }

    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
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
    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  if (source === 'equipment') {
    let updated: ProductDocLean | null = null;

    // First try to match by ObjectId using totalStock
    if (mongoose.Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, totalStock: { $gte: qty } },
        { $inc: { totalStock: -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }

    // Fallback to slug matching using totalStock
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

    return { id, qty, source, before: updated.totalStock + qty, after: updated.totalStock };
  }

  throw new Error(`Unknown product source for id=${id}`);
}

// Normalize address structure so order.shippingAddress/billingAddress use line1 (street)
function normalizeAddress(raw: unknown): Address | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawObj = raw as Record<string, unknown>;

  const possibleStreetKeys = ['address', 'address1', 'line1', 'street', 'street1', 'street_address'];
  let line1: string | undefined;
  for (const k of possibleStreetKeys) {
    const v = rawObj[k];
    if (typeof v === 'string' && v.trim() !== '') {
      line1 = v.trim();
      break;
    }
  }

  const out: Address = {};

  if (typeof rawObj.firstName === 'string') out.firstName = rawObj.firstName;
  if (typeof rawObj.first_name === 'string') out.firstName = rawObj.first_name;
  if (typeof rawObj.firstname === 'string') out.firstName = rawObj.firstname;

  if (typeof rawObj.lastName === 'string') out.lastName = rawObj.lastName;
  if (typeof rawObj.last_name === 'string') out.lastName = rawObj.last_name;
  if (typeof rawObj.lastname === 'string') out.lastName = rawObj.lastname;

  if (typeof rawObj.email === 'string') out.email = rawObj.email;
  if (typeof rawObj.phone === 'string') out.phone = rawObj.phone;

  if (typeof rawObj.unit === 'string') out.unit = rawObj.unit;
  if (typeof rawObj.flat === 'string') out.unit = rawObj.flat;
  if (typeof rawObj.apartment === 'string') out.unit = rawObj.apartment;

  if (line1) out.line1 = line1;
  if (typeof rawObj.city === 'string') out.city = rawObj.city;

  if (typeof rawObj.postcode === 'string') out.postcode = rawObj.postcode;
  if (typeof rawObj.postalCode === 'string') out.postcode = rawObj.postalCode;
  if (typeof rawObj.postal_code === 'string') out.postcode = rawObj.postal_code;

  if (typeof rawObj.country === 'string') out.country = rawObj.country;

  return Object.keys(out).length ? out : null;
}

// runtime validator for parsed items (no usage of `any`)
function validateItems(parsed: unknown): Item[] {
  if (!Array.isArray(parsed)) throw new Error('Items must be an array');

  const out: Item[] = parsed.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Invalid item at index ${idx}`);
    const obj = raw as Record<string, unknown>;

    const idCandidate = typeof obj.id === 'string' ? obj.id : typeof obj._id === 'string' ? obj._id : undefined;
    const nameCandidate = typeof obj.name === 'string' ? obj.name : undefined;
    const qtyCandidate =
      typeof obj.qty === 'number'
        ? obj.qty
        : typeof obj.qty === 'string' && obj.qty.trim() !== ''
        ? Number(obj.qty)
        : undefined;
    const unitPriceCandidate =
      typeof obj.unitPrice === 'number'
        ? obj.unitPrice
        : typeof obj.unitPrice === 'string' && obj.unitPrice.trim() !== ''
        ? Number(obj.unitPrice)
        : undefined;
    const totalPriceCandidate =
      typeof obj.totalPrice === 'number'
        ? obj.totalPrice
        : typeof obj.totalPrice === 'string' && obj.totalPrice.trim() !== ''
        ? Number(obj.totalPrice)
        : undefined;
    const sourceCandidate =
      typeof obj.source === 'string' && (obj.source === 'variant' || obj.source === 'coffee' || obj.source === 'equipment')
        ? (obj.source as ProductSource)
        : undefined;

    if (!idCandidate) throw new Error(`Item at index ${idx} missing id`);
    if (!nameCandidate) throw new Error(`Item at index ${idx} missing name`);
    if (!Number.isFinite(qtyCandidate as number) || (qtyCandidate as number) <= 0) throw new Error(`Item at index ${idx} has invalid qty`);
    if (!Number.isFinite(unitPriceCandidate as number) || (unitPriceCandidate as number) < 0) throw new Error(`Item at index ${idx} has invalid unitPrice`);
    if (!Number.isFinite(totalPriceCandidate as number) || (totalPriceCandidate as number) < 0) throw new Error(`Item at index ${idx} has invalid totalPrice`);

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

// Health check endpoint
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

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

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
      console.log('✅ Processing payment_intent.succeeded');

      const pi = event.data.object as Stripe.PaymentIntent;
      const paymentIntentId = pi.id;

      console.log('Payment Intent ID:', paymentIntentId);
      console.log('Amount:', pi.amount, 'pence');

      await dbConnect();
      console.log('✅ DB connected');

      // Create or claim an order record atomically using upsert to avoid duplicates
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

      const existingOrder = (existingOrderRaw as unknown) as OrderDocument | null;
      if (!existingOrder) {
        console.error('❌ Upsert unexpectedly returned no order');
        return new Response('Order upsert failed', { status: 500 });
      }

      if (existingOrder.status === 'paid' || existingOrder.status === 'failed') {
        console.log(`⚠️ Order already processed with status: ${existingOrder.status}`);
        console.log('Order ID:', existingOrder._id.toString());
        return NextResponse.json(
          {
            received: true,
            message: `Order already processed (${existingOrder.status})`,
            orderId: existingOrder._id.toString(),
          },
          { status: 200 }
        );
      }

      console.log('✅ This webhook will process the order');

      // Re-fetch latest PaymentIntent if possible
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

      // Parse items
      const itemsJson = metadata.items ?? '[]';
      console.log('Items JSON length:', itemsJson.length);

      const subtotal = parseFloat(metadata.subtotal ?? '') || 0;
      const shipping = parseFloat(metadata.shipping ?? '') || 0;
      const total = parseFloat(metadata.total ?? '') || 0;

      console.log('Totals - Subtotal:', subtotal, 'Shipping:', shipping, 'Total:', total);

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

      // normalize addresses to ensure street -> line1 is saved
      const shippingAddress = normalizeAddress(shippingAddressRaw);
      const billingAddress = normalizeAddress(billingAddressRaw);

      let client: Record<string, unknown> | null = null;
      if (metadata.client) {
        try {
          const parsedClient = JSON.parse(metadata.client);
          if (parsedClient && typeof parsedClient === 'object') {
            client = parsedClient as Record<string, unknown>;
            console.log('✅ Parsed client info');
          } else {
            client = null;
          }
        } catch (err) {
          console.warn('⚠️ Failed to parse client:', err);
          client = null;
        }
      }

      //
      // Robust client upsert/merge logic:
      //
      let clientDoc: ClientDocument | null = null;
      try {
        const hasClientMeta = client !== null;
        const fallbackEmail = !hasClientMeta && shippingAddress && shippingAddress.email ? shippingAddress.email.trim().toLowerCase() : undefined;

        const emailFromMeta =
          hasClientMeta && typeof client!.email === 'string' && client!.email.trim() !== '' ? (client!.email as string).trim().toLowerCase() : undefined;
        const phoneFromMeta = hasClientMeta && typeof client!.phone === 'string' && client!.phone.trim() !== '' ? (client!.phone as string).trim() : undefined;
        const email = emailFromMeta ?? fallbackEmail;
        const phone = phoneFromMeta ?? undefined;

        if (email || phone || hasClientMeta) {
          const payload: Record<string, unknown> = {
            updatedAt: new Date(),
          };

          if (hasClientMeta && typeof client!.name === 'string') {
            payload.name = client!.name as string;
          } else if (
            hasClientMeta &&
            (typeof client!['firstName'] === 'string' || typeof client!['lastName'] === 'string')
          ) {
            payload.name = `${(client!['firstName'] as string) || ''} ${(client!['lastName'] as string) || ''}`.trim();
          }

          if (email) payload.email = email;
          if (phone) payload.phone = phone;

          if (hasClientMeta && client!.address && typeof client!.address === 'object') {
            payload.address = normalizeAddress(client!.address);
          } else if (shippingAddress) {
            payload.address = shippingAddress;
          }

          payload.metadata = {
            lastSeenFrom: 'stripe-webhook',
            updatedAt: new Date().toISOString(),
          };

          // 1) Try to find any existing client by email OR phone
          const lookup: Array<Record<string, unknown>> = [];
          if (email) lookup.push({ email });
          if (phone) lookup.push({ phone });

          let existing: ClientDocument | null = null;
          if (lookup.length) {
            const rawExisting = await Client.findOne({ $or: lookup }).exec();
            existing = rawExisting ? ((rawExisting as unknown) as ClientDocument) : null;
          }

          if (existing) {
            const rawUpdated = await Client.findByIdAndUpdate(existing._id, { $set: payload }, { new: true, setDefaultsOnInsert: true }).exec();
            clientDoc = rawUpdated ? ((rawUpdated as unknown) as ClientDocument) : null;
            console.log(`[Client] Merged into existing client ${existing._id.toString()}`);
          } else {
            try {
              const metaBase = (payload.metadata as Record<string, unknown>) ?? {};
              const created = await Client.create({
                ...payload,
                metadata: { ...metaBase, createdBy: 'stripe-webhook' },
                createdAt: new Date(),
              });
              clientDoc = (created as unknown) as ClientDocument;
              console.log(`[Client] Created new client ${clientDoc._id.toString()}`);
            } catch (createErr) {
              console.warn('[Client] Create failed, retrying lookup due to possible race:', createErr);
              if (email || phone) {
                const retryLookup: Array<Record<string, unknown>> = [];
                if (email) retryLookup.push({ email });
                if (phone) retryLookup.push({ phone });
                const foundRaw = await Client.findOne({ $or: retryLookup }).exec();
                const found = foundRaw ? ((foundRaw as unknown) as ClientDocument) : null;
                if (found) {
                  const mergedRaw = await Client.findByIdAndUpdate(found._id, { $set: payload }, { new: true, setDefaultsOnInsert: true }).exec();
                  clientDoc = mergedRaw ? ((mergedRaw as unknown) as ClientDocument) : null;
                  console.log(`[Client] Found and merged into existing client after race ${found._id.toString()}`);
                } else {
                  throw createErr;
                }
              } else {
                throw createErr;
              }
            }
          }

          if (clientDoc) {
            try {
              await Order.findOneAndUpdate({ paymentIntentId }, { $set: { clientId: clientDoc._id } }).exec();
              console.log('[Order] Attached clientId to order');
            } catch (oerr) {
              console.warn('[Order] Failed to attach clientId to order (non-fatal):', oerr);
            }
          }
        } else {
          console.log('[Client] No client metadata or shipping email available — skipping client upsert');
        }
      } catch (upsertErr) {
        console.warn('⚠️ Failed to upsert/merge client (continuing without clientId):', upsertErr);
        clientDoc = null;
      }

      // Parse items array with runtime validation (no `any`)
      const parsedRaw = JSON.parse(itemsJson) as unknown;
      let items: Item[];
      try {
        items = validateItems(parsedRaw);
        console.log('✅ Parsed', items.length, 'items');
      } catch (err) {
        console.error('❌ Failed to parse items:', err);

        // Mark order as failed using atomic update
        try {
          await Order.updateOne(
            { _id: existingOrder._id },
            {
              $set: {
                status: 'failed',
                metadata: {
                  ...(existingOrder.metadata ?? {}),
                  failureReason: 'Invalid items metadata',
                  webhookEventId: event.id,
                },
                clientId: clientDoc ? clientDoc._id : existingOrder.clientId ?? null,
              },
            }
          ).exec();
        } catch (updateErr) {
          console.error('❌ Failed to persist failed order after invalid items:', updateErr);
        }

        return new Response('Invalid items metadata', { status: 500 });
      }

      if (!Array.isArray(items) || items.length === 0) {
        console.error('❌ No items found');

        // Mark order as failed using atomic update
        try {
          await Order.updateOne(
            { _id: existingOrder._id },
            {
              $set: {
                status: 'failed',
                metadata: {
                  ...(existingOrder.metadata ?? {}),
                  failureReason: 'No items in metadata',
                  webhookEventId: event.id,
                },
                clientId: clientDoc ? clientDoc._id : existingOrder.clientId ?? null,
              },
            }
          ).exec();
        } catch (updateErr) {
          console.error('❌ Failed to persist failed order after missing items:', updateErr);
        }

        return new Response('No items in metadata', { status: 500 });
      }

      // Start transaction for stock updates
      console.log('Starting transaction...');
      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();

      try {
        const stockChanges: Array<{ id: string; qty: number; source?: ProductSource; before: number; after: number }> = [];

        // Decrement stock
        console.log('Decrementing stock...');
        for (const item of items) {
          const { id, qty, source = 'variant' } = item;

          if (!id) throw new Error('Missing item id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid qty for id=${id}`);

          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
          console.log(`✅ ${item.name}: ${change.before} → ${change.after}`);
        }

        // Update order with payment details atomically within transaction
        console.log('Updating order with full details (atomic update in tx)...');

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

        await Order.updateOne({ _id: existingOrder._id }, { $set: updatePayload }, { session }).exec();

        console.log('✅ Order updated (via updateOne in tx):', existingOrder._id.toString());

        await session.commitTransaction();
        session.endSession();
        console.log('✅ Transaction committed');

        // fetch fresh order for downstream processing (invoice generation etc.)
        const savedOrderRaw = await Order.findById(existingOrder._id).exec();
        const savedOrder = savedOrderRaw ? ((savedOrderRaw as unknown) as OrderDocument) : null;
        if (!savedOrder) {
          console.warn('⚠️ Order was updated but could not be re-fetched for invoice generation');
        }

        // Prepare invoice data & company info
        const companyInfo = {
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

        const orderNumber = `INV-${new Date().getFullYear()}-${String(existingOrder._id).slice(-8).toUpperCase()}`;

        // Prefer clientDoc for invoice details; fall back to metadata client or shippingAddress
        const invoiceClientPhone =
          asStringOrUndefined(clientDoc?.phone) ?? asStringOrUndefined(client?.phone) ?? asStringOrUndefined(shippingAddress?.phone);

        const invoiceClient = {
          name:
            (clientDoc && typeof clientDoc.name === 'string'
              ? clientDoc.name
              : client && typeof client.name === 'string'
              ? client.name
              : `${(shippingAddress?.firstName || '')} ${(shippingAddress?.lastName || '')}`.trim()) ?? '',
          email:
            (clientDoc && typeof clientDoc.email === 'string'
              ? clientDoc.email
              : client && typeof client.email === 'string'
              ? client.email
              : shippingAddress?.email) ?? '',
          phone: invoiceClientPhone,
        };

        const invoiceData = {
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
          // For invoices we keep a flat 'address' field for human-readable PDF generation
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
          paidAt: savedOrder?.paidAt ?? new Date(),
          paymentIntentId,
        };

        // Save invoice JSON in DB (data-only)
        try {
          const invoiceCreatedRaw = await Invoice.create({
            source: 'stripe',
            orderId: existingOrder._id,
            orderNumber,
            items: invoiceData.items,
            subtotal: invoiceData.subtotal,
            shipping: invoiceData.shipping,
            total: invoiceData.total,
            currency: savedOrder?.currency || 'gbp',
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
              webhookEventId: event.id,
              processedAt: new Date().toISOString(),
            },
          });

          const invoiceDoc = (invoiceCreatedRaw as unknown) as InvoiceDocument;

          await Order.findByIdAndUpdate(existingOrder._id, {
            $set: {
              'metadata.invoiceSaved': true,
              'metadata.invoiceId': invoiceDoc._id.toString(),
              'metadata.orderNumber': orderNumber,
            },
          }).exec();

          console.log(`✅ Invoice record saved: ${invoiceDoc._id.toString()}`);

          // Fire-and-forget: generate PDF & send email in background
          processInvoice(invoiceData, companyInfo)
            .then(async () => {
              try {
                await Invoice.findByIdAndUpdate(invoiceDoc._id, {
                  $set: { sent: true, sentAt: new Date(), sendError: null },
                }).exec();

                await Order.findByIdAndUpdate(existingOrder._id, {
                  $set: {
                    'metadata.invoiceSent': true,
                    'metadata.invoiceSentAt': new Date().toISOString(),
                    'metadata.orderNumber': orderNumber,
                  },
                }).exec();

                console.log(`✅ Invoice email sent for invoice ${invoiceDoc._id.toString()}`);
              } catch (updateErr) {
                console.error('⚠️ Failed to update invoice/order after successful send:', updateErr);
              }
            })
            .catch(async (invoiceError) => {
              console.error('⚠️ Failed to send invoice (order still created):', invoiceError);
              try {
                await Invoice.findByIdAndUpdate(invoiceDoc._id, {
                  $set: {
                    sent: false,
                    sendError: invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
                  },
                }).exec();

                await Order.findByIdAndUpdate(existingOrder._id, {
                  $set: {
                    'metadata.invoiceSent': false,
                    'metadata.invoiceError': invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
                  },
                }).exec();
              } catch (updateErr) {
                console.error('⚠️ Failed to update invoice/order after send error:', updateErr);
              }
            });

          // Notify admin (fire-and-forget) that a new paid order arrived
          const adminDashboardUrl = process.env.ADMIN_DASHBOARD_URL
            ? `${process.env.ADMIN_DASHBOARD_URL.replace(/\/$/, '')}/orders/${existingOrder._id}`
            : undefined;

          (async () => {
            try {
              await sendAdminNotification({
                orderId: existingOrder._id.toString(),
                orderNumber,
                total: existingOrder.total ?? total,
                currency: existingOrder.currency ?? 'gbp',
                clientName: invoiceData.client.name ?? '',
                clientEmail: invoiceData.client.email ?? '',
                items: invoiceData.items,
                dashboardUrl: adminDashboardUrl,
                metadata: { webhookEventId: event.id },
              });

              // mark order and invoice as admin-notified
              try {
                await Order.findByIdAndUpdate(existingOrder._id, {
                  $set: {
                    'metadata.adminNotified': true,
                    'metadata.adminNotifiedAt': new Date().toISOString(),
                  },
                }).exec();
                await Invoice.findByIdAndUpdate(invoiceDoc._id, {
                  $set: { 'metadata.adminNotified': true, 'metadata.adminNotifiedAt': new Date().toISOString() },
                }).exec();
              } catch (uErr) {
                console.warn('Failed to update admin notification metadata:', uErr);
              }

              console.log(`✉️ Admin notified for order ${existingOrder._id.toString()}`);
            } catch (notifyErr) {
              console.error('⚠️ Failed to send admin notification:', notifyErr);
              try {
                await Order.findByIdAndUpdate(existingOrder._id, {
                  $set: {
                    'metadata.adminNotified': false,
                    'metadata.adminNotificationError': notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
                  },
                }).exec();
                await Invoice.findByIdAndUpdate(invoiceDoc._id, {
                  $set: {
                    'metadata.adminNotified': false,
                    'metadata.adminNotificationError': notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
                  },
                }).exec();
              } catch (uErr) {
                console.warn('Failed to persist admin notification error to DB:', uErr);
              }
            }
          })();
        } catch (invoiceSaveErr) {
          console.error('❌ Failed to save invoice record:', invoiceSaveErr);
          try {
            await Order.findByIdAndUpdate(existingOrder._id, {
              $set: {
                'metadata.invoiceSaved': false,
                'metadata.invoiceError': invoiceSaveErr instanceof Error ? invoiceSaveErr.message : String(invoiceSaveErr),
              },
            }).exec();
          } catch (orderUpdateErr) {
            console.error('❌ Failed to update order metadata after invoice save error:', orderUpdateErr);
          }
        }

        console.log('========== SUCCESS ==========\n');

        return NextResponse.json({ received: true, orderId: existingOrder._id.toString() }, { status: 200 });
      } catch (txErr) {
        console.error('❌ Transaction failed:', txErr);

        try {
          await session.abortTransaction();
        } catch (aerr) {
          console.warn('⚠️ Error aborting transaction:', aerr);
        } finally {
          session.endSession();
        }

        const msg = txErr instanceof Error ? txErr.message : String(txErr);

        // Update the existing order to failed status (atomic update)
        try {
          await Order.updateOne(
            { _id: existingOrder._id },
            {
              $set: {
                status: 'failed',
                items,
                subtotal: Number(subtotal.toFixed(2)),
                shipping: Number(shipping.toFixed(2)),
                total: Number(total.toFixed(2)),
                currency: 'gbp',
                metadata: {
                  failureReason: msg,
                  prices_verified: true,
                  webhookEventId: event.id,
                  failedAt: new Date().toISOString(),
                },
                ...(shippingAddress ? { shippingAddress } : {}),
                ...(billingAddress ? { billingAddress } : {}),
                ...(clientDoc ? { clientId: clientDoc._id } : {}),
              },
            }
          ).exec();

          console.log('✅ Failed order record updated (atomic update)');
        } catch (e) {
          console.error('❌ Failed to update failed order:', e);
        }

        return new Response('Processing error', { status: 500 });
      }
    }

    console.log('Event type not handled:', event.type);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return new Response('Webhook handler error', { status: 500 });
  }
}