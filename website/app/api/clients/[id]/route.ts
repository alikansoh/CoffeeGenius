import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import Order from '@/models/Order';
import mongoose from 'mongoose';

/**
 * GET / PATCH / DELETE for a single client
 * - robustly extracts id from params if present, otherwise from URL path
 * - returns Promise<NextResponse> (async)
 *
 * PATCH body: { name?, email?, phone?, address?, isSubscribed? }
 * DELETE: unsets clientId on orders, then deletes client doc
 */

function extractId(req: Request, params?: { id?: string }) {
  // Use params first (App Router passes { params })
  if (params?.id) return params.id;
  // Fallback: parse from URL
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','admin','clients','<id>']
  const clientsIdx = segments.findIndex((s) => s === 'clients');
  if (clientsIdx >= 0 && segments.length > clientsIdx + 1) return segments[clientsIdx + 1];
  return undefined;
}

export async function GET(req: Request, { params }: { params?: { id?: string } } = { params: undefined }) {
  try {
    const id = extractId(req, params);
    if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });

    await dbConnect();
    const client = await Client.findById(id).lean().exec();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    return NextResponse.json(client, { status: 200 });
  } catch (err) {
    console.error('GET client failed:', err);
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params?: { id?: string } } = { params: undefined }) {
  try {
    const id = extractId(req, params);
    if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    if (typeof body.name === 'string') update.name = body.name.trim();
    if (typeof body.email === 'string') update.email = body.email.trim();
    if (typeof body.phone === 'string') update.phone = body.phone.trim();
    if (body.address && typeof body.address === 'object') update.address = body.address;
    if (typeof body.isSubscribed === 'boolean') update.isSubscribed = body.isSubscribed;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await dbConnect();

    const updated = await Client.findByIdAndUpdate(id, { $set: update }, { new: true }).lean().exec();
    if (!updated) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('PATCH client failed:', err);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params?: { id?: string } } = { params: undefined }) {
  try {
    const id = extractId(req, params);
    if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });

    await dbConnect();

    // Unset clientId on related orders (so orders are retained but no longer linked)
    await Order.updateMany({ clientId: id }, { $unset: { clientId: "" } }).exec();

    // Delete client document
    const result = await Client.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id }, { status: 200 });
  } catch (err) {
    console.error('DELETE client failed:', err);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}