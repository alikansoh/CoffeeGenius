import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import Order from '@/models/Order';
import mongoose from 'mongoose';

/**
 * Robust route handler that works regardless of how Next may pass params.
 * - Extracts the client id from the request URL path rather than relying on the second arg.
 * - Returns a Promise<NextResponse> (async function).
 * - Validates id, connects to DB, returns simplified order list.
 */

interface OrderResponse {
  _id?: mongoose.Types.ObjectId;
  orderNumber?: string | number;
  createdAt?: Date;
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  status?: string;
  items?: unknown[];
}

export async function GET(req: Request) {
  try {
    // Extract id from path as a fallback for different Next versions/environments
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean); // e.g. ['api','admin','clients',':id','orders']
    const clientsIdx = segments.findIndex((s) => s === 'clients');
    const id = clientsIdx >= 0 && segments.length > clientsIdx + 1 ? segments[clientsIdx + 1] : undefined;

    if (!id) {
      return NextResponse.json({ error: 'Missing client id in URL path' }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
    }

    // Ensure DB connection
    await dbConnect();

    // Verify client exists
    const client = await Client.findById(id).lean().exec();
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Fetch orders for client
    const orders = await Order.find({ clientId: client._id })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Simplified response shape for the UI
    const out = (orders as OrderResponse[]).map((o) => ({
      _id: o._id?.toString(),
      orderNumber: o.orderNumber || null,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
      subtotal: o.subtotal ?? 0,
      shipping: o.shipping ?? 0,
      total: o.total ?? 0,
      currency: (o.currency || 'gbp').toUpperCase(),
      status: o.status || null,
      items: o.items || [],
    }));

    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch client orders:', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}