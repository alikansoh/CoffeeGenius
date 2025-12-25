export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';

type ProductSource = 'variant' | 'coffee' | 'equipment';

interface ProductDocLean {
  _id?:  mongoose.Types.ObjectId | string;
  stock?:  number;
  coffeeId?: mongoose.Types.ObjectId | string;
  slug?: string;
  [k: string]: unknown;
}

interface OrderDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  items?:  unknown[];
  status?:  string;
  paymentIntentId?: string;
  paidAt?: Date | null;
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  client?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  save(opts?:  { session?: mongoose.ClientSession }): Promise<this>;
  [k: string]: unknown;
}

async function decrementOneAtomic(
  session: mongoose.ClientSession | null,
  item: { id: string; qty:  number; source?: string }
): Promise<{ id: string; qty: number; source:  string; before: number; after: number }> {
  const { id, qty, source = 'variant' } = item;
  const sessionOpt = session ??  undefined;

  console.log(`[decrementOneAtomic] Decrementing ${qty}x ${source} id=${id}`);

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
      { _id: id, stock: { $gte:  qty } },
      { $inc: { stock: -qty } },
      { new: true, session: sessionOpt, lean: true }
    ).exec()) as ProductDocLean | null;

    if (!updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or coffee not found for id=${id}`);
    }
    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  if (source === 'equipment') {
    let updated = null as ProductDocLean | null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      updated = (await Equipment.findOneAndUpdate(
        { _id: id, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new:  true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }
    if (! updated) {
      updated = (await Equipment.findOneAndUpdate(
        { slug: id, stock: { $gte: qty } },
        { $inc: { stock:  -qty } },
        { new: true, session: sessionOpt, lean: true }
      ).exec()) as ProductDocLean | null;
    }
    if (! updated || typeof updated.stock !== 'number') {
      throw new Error(`Insufficient stock or equipment not found for id/slug=${id}`);
    }
    return { id, qty, source, before: updated.stock + qty, after: updated.stock };
  }

  throw new Error(`Unknown product source for id=${id}`);
}

export async function POST(req: Request) {
  console.log('\n========== WEBHOOK RECEIVED ==========');
  
  const webhookSecret = process.env. STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  
  console.log('[Config Check]');
  console.log('- STRIPE_WEBHOOK_SECRET:', webhookSecret ?  '✅ Set' : '❌ Missing');
  console.log('- STRIPE_SECRET_KEY:', stripeSecret ? '✅ Set' : '❌ Missing');
  
  if (!webhookSecret || ! stripeSecret) {
    console.error('❌ Missing Stripe configuration');
    return new Response('Missing configuration', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-12-15.clover' });

  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req. headers.get('stripe-signature') ??  '';

  console.log('[Signature Check]');
  console.log('- Signature present:', sig ? '✅ Yes' : '❌ No');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('✅ Webhook signature verified');
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[Event Details]');
  console.log('- Event type:', event.type);
  console.log('- Event ID:', event.id);

  try {
    if (event.type === 'payment_intent.succeeded') {
      console.log('\n✅ Processing payment_intent.succeeded');
      
      const pi = event. data.object as Stripe.PaymentIntent;
      const paymentIntentId = pi.id;

      console.log('[Payment Intent]');
      console.log('- ID:', paymentIntentId);
      console.log('- Amount:', pi.amount, 'pence');
      console.log('- Status:', pi.status);

      console.log('[Database Connection]');
      await dbConnect();
      console.log('✅ Connected to database');

      // Check if order already exists
      console.log('[Idempotency Check]');
      const existingOrder = (await Order.findOne({ paymentIntentId }).exec()) as OrderDocument | null;
      
      if (existingOrder) {
        console.log('⚠️ Order already exists:', existingOrder._id.toString());
        return NextResponse.json({ received: true, message: 'Order already exists' }, { status: 200 });
      }
      console.log('✅ No existing order found, proceeding.. .');

      // Re-fetch PaymentIntent for latest metadata
      console.log('[Fetching Latest Metadata]');
      let latestPI:  Stripe.PaymentIntent;
      try {
        latestPI = await stripe.paymentIntents.retrieve(paymentIntentId);
        console.log('✅ Retrieved latest PaymentIntent');
      } catch (err) {
        console.warn('⚠️ Failed to retrieve latest PI, using event data:', err);
        latestPI = pi;
      }

      const metadata = latestPI.metadata && typeof latestPI.metadata === 'object' ? latestPI.metadata : {};
      
      console.log('[Metadata Keys]');
      console.log('- All keys:', Object.keys(metadata));
      console.log('- metadata.items:', metadata.items ?  `✅ Present (${(metadata.items as string).length} chars)` : '❌ Missing');
      console.log('- metadata.subtotal:', metadata.subtotal || '❌ Missing');
      console.log('- metadata.shipping:', metadata.shipping || '❌ Missing');
      console.log('- metadata.total:', metadata. total || '❌ Missing');
      console.log('- metadata.shippingAddress:', metadata.shippingAddress ?  '✅ Present' : '⚠️ Missing');

      // Parse items
      const itemsCandidates = [
        metadata.items,
        metadata.items_json,
        metadata.itemsPayload,
        metadata.itemsPayloadString,
      ];
      
      let itemsJson = '[]';
      for (let i = 0; i < itemsCandidates.length; i++) {
        const cand = itemsCandidates[i];
        if (typeof cand === 'string' && cand.trim()) {
          console.log(`✅ Found items in candidate ${i}: `, cand.substring(0, 100) + '...');
          itemsJson = cand;
          break;
        }
      }

      if (itemsJson === '[]') {
        console.error('❌ CRITICAL: No items found in any metadata field! ');
        console.error('Full metadata:', JSON.stringify(metadata, null, 2));
        return new Response('No items in metadata - webhook will retry', { status: 500 });
      }

      const subtotal = parseFloat((metadata.subtotal as string) ?? '') || 0;
      const shipping = parseFloat((metadata.shipping as string) ?? '') || 0;
      const total = parseFloat((metadata.total as string) ?? '') || 0;

      console.log('[Order Totals]');
      console.log('- Subtotal:', subtotal);
      console.log('- Shipping:', shipping);
      console.log('- Total:', total);

      // Parse shipping/billing/client
      const shippingAddressCandidates = [
        metadata.shippingAddress,
        metadata.shipping_address,
        metadata.shipping_payload,
        metadata.shippingPayload,
      ];
      let shippingAddressJson:  string | null = null;
      for (const s of shippingAddressCandidates) {
        if (typeof s === 'string' && s.trim()) {
          shippingAddressJson = s;
          break;
        }
      }

      const billingAddressCandidates = [
        metadata.billingAddress,
        metadata.billing_address,
        metadata.billing_payload,
        metadata.billingPayload,
      ];
      let billingAddressJson: string | null = null;
      for (const b of billingAddressCandidates) {
        if (typeof b === 'string' && b.trim()) {
          billingAddressJson = b;
          break;
        }
      }

      const clientCandidates = [metadata.client, metadata.customer, metadata.clientInfo];
      let clientJson: string | null = null;
      for (const c of clientCandidates) {
        if (typeof c === 'string' && c.trim()) {
          clientJson = c;
          break;
        }
      }

      let shippingAddress = null;
      if (shippingAddressJson) {
        try {
          shippingAddress = JSON.parse(shippingAddressJson);
          console.log('✅ Parsed shipping address');
        } catch (err) {
          console.warn('⚠️ Failed to parse shippingAddress:', err);
        }
      }

      let billingAddress = null;
      if (billingAddressJson) {
        try {
          billingAddress = JSON. parse(billingAddressJson);
          console.log('✅ Parsed billing address');
        } catch (err) {
          console.warn('⚠️ Failed to parse billingAddress:', err);
        }
      }

      let client = null;
      if (clientJson) {
        try {
          client = JSON.parse(clientJson);
          console.log('✅ Parsed client info');
        } catch (err) {
          console.warn('⚠️ Failed to parse client:', err);
        }
      }

      // Parse items
      console.log('[Parsing Items]');
      console.log('- itemsJson:', itemsJson. substring(0, 200) + (itemsJson.length > 200 ? '...' : ''));
      
      let items:  Array<{ id: string; name: string; qty: number; unitPrice: number; totalPrice: number; source: string }> = [];
      try {
        items = JSON.parse(itemsJson);
        console.log('✅ Parsed items array:', items.length, 'items');
        items.forEach((item, idx) => {
          console.log(`  ${idx + 1}. ${item.name} (id=${item.id}, qty=${item.qty}, source=${item.source})`);
        });
      } catch (err) {
        console.error('❌ CRITICAL: Failed to parse items JSON:', err);
        console.error('Raw itemsJson:', itemsJson);
        return new Response('Invalid items metadata - webhook will retry', { status:  500 });
      }

      if (! Array.isArray(items) || items.length === 0) {
        console.error('❌ CRITICAL: Items array is empty! ');
        return new Response('No items in metadata - webhook will retry', { status:  500 });
      }

      // Start transaction
      console.log('\n[Transaction Starting]');
      const conn = mongoose.connection;
      const session = await conn.startSession();
      session.startTransaction();
      console.log('✅ Transaction started');

      try {
        const stockChanges: Array<{ id:  string; qty: number; source?:  string; before: number; after: number }> = [];

        // Decrement stock
        console.log('[Stock Decrement]');
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log(`Processing item ${i + 1}/${items.length}:`, item.name);

          if (! item || typeof item !== 'object') {
            throw new Error('Order contains invalid item');
          }

          const id = typeof item.id === 'string' ? item.id : String(item.id ??  '');
          const qty = typeof item.qty === 'number' ? item.qty : Number(item.qty ?? 0);
          const source = typeof item.source === 'string' ? item.source : 'variant';

          if (! id) throw new Error('Order contains item with missing id');
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid qty for id=${id}`);

          const change = await decrementOneAtomic(session, { id, qty, source });
          stockChanges.push(change);
          console.log(`✅ Stock decremented:  ${change.before} → ${change.after}`);
        }

        // Create order
        console.log('\n[Creating Order]');
        const orderData:  Record<string, unknown> = {
          items,
          subtotal: Number(subtotal. toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(total.toFixed(2)),
          currency: 'gbp',
          status: 'paid',
          paymentIntentId,
          paidAt: new Date(),
          metadata:  {
            prices_verified: true,
            stockChanges,
            stockDecremented: true,
            pricedAt: new Date().toISOString(),
            shippingConfirmed: !!shippingAddress,
          },
        };

        if (shippingAddress) {
          orderData.shippingAddress = shippingAddress;
          console.log('✅ Shipping address added to order');
        }
        if (billingAddress) {
          orderData.billingAddress = billingAddress;
          console.log('✅ Billing address added to order');
        }
        if (client) {
          orderData.client = client;
          console.log('✅ Client info added to order');
        }

        console.log('Creating Order document...');
        const newOrder = new Order(orderData);
        
        console.log('Saving order to database...');
        await newOrder.save({ session });
        console.log('✅ Order saved to database:', newOrder._id.toString());

        console.log('Committing transaction...');
        await session.commitTransaction();
        session.endSession();
        console.log('✅ Transaction committed');

        console.log('\n========== SUCCESS ==========');
        console.log('Order ID:', newOrder._id.toString());
        console.log('Payment Intent:', paymentIntentId);
        console.log('==============================\n');

        return NextResponse. json({ 
          received: true, 
          orderId: newOrder._id.toString() 
        }, { status: 200 });

      } catch (txErr) {
        console.error('\n❌ TRANSACTION FAILED');
        console.error('Error:', txErr);
        
        await session.abortTransaction();
        session.endSession();
        console.log('Transaction aborted');

        const msg = txErr instanceof Error ? txErr.message : String(txErr);

        // Create failed order record
        console.log('[Creating Failed Order Record]');
        try {
          const failedOrderData: Record<string, unknown> = {
            items,
            subtotal: Number(subtotal. toFixed(2)),
            shipping: Number(shipping.toFixed(2)),
            total: Number(total.toFixed(2)),
            currency: 'gbp',
            status: 'failed',
            paymentIntentId,
            metadata: {
              failureReason: msg,
              prices_verified: true,
            },
          };

          if (shippingAddress) failedOrderData.shippingAddress = shippingAddress;
          if (billingAddress) failedOrderData.billingAddress = billingAddress;
          if (client) failedOrderData.client = client;

          await Order.create(failedOrderData);
          console.log('✅ Failed order record created');
        } catch (e) {
          console.error('❌ Failed to create failed order record:', e);
        }

        return new Response('Processing error - webhook will retry', { status:  500 });
      }
    }

    console.log('⚠️ Event type not handled:', event.type);
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (err) {
    console.error('\n❌ WEBHOOK HANDLER ERROR');
    console.error(err);
    return new Response('Webhook handler error', { status: 500 });
  }
}