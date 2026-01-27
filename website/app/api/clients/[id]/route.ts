import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import Order from '@/models/Order';
import mongoose from 'mongoose';

type ContextLike = { params?: { id?: string | string[] } | Promise<{ id: string }> } | undefined;

function isThenable<T>(v: T | Promise<T> | undefined): v is Promise<T> {
  return !!v && typeof (v as Promise<T>).then === 'function';
}

async function resolveId(req: NextRequest, context?: ContextLike): Promise<string | undefined> {
  // 1) try context.params (may be sync object or Promise<{id: string}>)
  if (context && context.params !== undefined) {
    const p = context.params;
    if (isThenable(p)) {
      try {
        const resolved = await p;
        if (resolved?.id) return resolved.id;
      } catch {
        // fallthrough to other methods
      }
    } else {
      const idField = p.id;
      if (typeof idField === 'string' && idField.trim() !== '') return idField;
      if (Array.isArray(idField) && idField.length > 0) return String(idField[0]);
    }
  }

  // 2) fallback: parse from URL pathname (/api/admin/clients/<id>)
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const clientsIdx = parts.findIndex((s) => s === 'clients');
    if (clientsIdx >= 0 && parts.length > clientsIdx + 1) return parts[clientsIdx + 1];
    // last-segment fallback
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last && !['api', 'admin', 'clients'].includes(last.toLowerCase())) return decodeURIComponent(last);
    }
  } catch {
    // ignore
  }

  return undefined;
}

/* GET */
export async function GET(req: NextRequest, context?: ContextLike) {
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

/* PATCH */
export async function PATCH(req: NextRequest, context?: ContextLike) {
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

/* DELETE */
export async function DELETE(req: NextRequest, context?: ContextLike) {
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