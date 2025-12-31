export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';

type Body = {
  email?: string | null;
  phone?: string | null;
};

function normalizeEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  // keep only digits for simple matching
  const digits = String(phone).replace(/\D/g, '');
  return digits || undefined;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = normalizeEmail(body.email ?? null);
    const phoneDigits = normalizePhone(body.phone ?? null);

    if (!email && !phoneDigits) {
      return NextResponse.json({ error: 'Provide email or phone' }, { status: 400 });
    }

    await dbConnect();

    let client = null;

    if (email) {
      client = await Client.findOne({ email }).lean().exec();
    }

    if (!client && phoneDigits) {
      // attempt a fuzzy phone match: find any document where the phone contains the digits sequence
      // This is a pragmatic approach; adjust for your stored phone format if necessary
      const regex = new RegExp(phoneDigits.replace(/(\d{3})(?=\d)/g, '$1'), 'i');
      client = await Client.findOne({ phone: { $regex: regex } }).lean().exec();
    }

    if (!client) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    // return only the fields needed by the frontend (avoid returning internal metadata)
    const payload = {
      _id: client._id,
      name: client.name ?? null,
      email: client.email ?? null,
      phone: client.phone ?? null,
      address: client.address ?? null,
    };

    return NextResponse.json({ found: true, client: payload }, { status: 200 });
  } catch (err) {
    console.error('[clients/find] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}