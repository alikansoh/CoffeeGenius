import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import Order from '@/models/Order';
import mongoose from 'mongoose';

type MaybeParams =
  | { params?: { id?: string } }
  | { params: Promise<{ id: string }> }
  | undefined;

function extractIdFromUrl(req: Request | NextRequest): string | undefined {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','admin','clients','<id>']
  const clientsIdx = segments.findIndex((s) => s === 'clients');
  if (clientsIdx >= 0 && segments.length > clientsIdx + 1) return segments[clientsIdx + 1];
  return undefined;
}

function isPromise<T>(value: T | Promise<T> | undefined): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === 'function';
}

async function resolveId(req: Request | NextRequest, context?: MaybeParams): Promise<string | undefined> {
  if (!context) return extractIdFromUrl(req);

  // context may be { params?: { id?: string } } or { params: Promise<{ id: string }> }
  const paramsField = (context as { params?: { id?: string } }).params;
  if (paramsField === undefined) return extractIdFromUrl(req);

  if (isPromise(paramsField)) {
    const resolved = await paramsField;
    return resolved?.id ?? extractIdFromUrl(req);
  }

  // synchronous params object
  return paramsField.id ?? extractIdFromUrl(req);
}

/**
 * GET / PATCH / DELETE for a single client
 * - robustly extracts id from context.params (sync or Promise) or URL path
 * - returns NextResponse
 *
 * PATCH body: { name?, email?, phone?, address?, isSubscribed? }
 * DELETE: unsets clientId on orders, then deletes client doc
 */

export async function GET(req: NextRequest, context?: MaybeParams) {
  try {
    const id = await resolveId(req, context);
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

export async function PATCH(req: NextRequest, context?: MaybeParams) {
  try {
    const id = await resolveId(req, context);
    if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });

    const rawBody = await req.json().catch(() => ({})) as unknown;

    const update: Record<string, unknown> = {};
    if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
      const body = rawBody as Record<string, unknown>;

      if (typeof body.name === 'string') update.name = body.name.trim();
      if (typeof body.email === 'string') update.email = body.email.trim();
      if (typeof body.phone === 'string') update.phone = body.phone.trim();
      if (body.address && typeof body.address === 'object') update.address = body.address;
      if (typeof body.isSubscribed === 'boolean') update.isSubscribed = body.isSubscribed;
    }

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

export async function DELETE(req: NextRequest, context?: MaybeParams) {
  try {
    const id = await resolveId(req, context);
    if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });

    await dbConnect();

    // Unset clientId on related orders (so orders are retained but no longer linked)
    await Order.updateMany({ clientId: id }, { $unset: { clientId: '' } }).exec();

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