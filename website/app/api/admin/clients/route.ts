import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import mongoose, { PipelineStage } from 'mongoose';
import Order from '@/models/Order';

interface Address {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface AggregatedClient {
  _id: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  orderCount: number;
  totalSpent: number;
  updatedAt: Date;
}

// Returns paginated clients with orderCount and totalSpent
export async function GET(req: Request) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '25')));
    const q = (url.searchParams.get('q') || '').trim();

    const match: Record<string, unknown> = {};
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { 'address.line1': regex },
        { 'address.postcode': regex },
      ];
    }

    const skip = (page - 1) * limit;

    // Aggregate clients with order stats
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'orders',
          let: { clientId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$clientId', '$$clientId'] } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
          as: 'ordersAgg',
        },
      },
      {
        $addFields: {
          orderCount: { $ifNull: [{ $arrayElemAt: ['$ordersAgg.count', 0] }, 0] },
          totalSpent: { $ifNull: [{ $arrayElemAt: ['$ordersAgg.total', 0] }, 0] },
        },
      },
      { $project: { ordersAgg: 0 } },
      { $sort: { updatedAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const [data, total] = await Promise.all([
      Client.aggregate(pipeline).exec(),
      Client.countDocuments(match).exec(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      meta: { total, page, limit, totalPages },
      data: data as AggregatedClient[],
    });
  } catch (err) {
    console.error('Failed to fetch clients with totals:', err);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => ({}));
    const name = (body.name || '').toString().trim();
    const email = body.email ? (body.email || '').toString().trim().toLowerCase() : '';
    const phone = body.phone ? (body.phone || '').toString().trim() : '';
    const address = body.address && typeof body.address === 'object' ? body.address : {};

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    // Prevent duplicate by email if provided
    if (email) {
      const existing = await Client.findOne({ email }).lean().exec();
      if (existing) {
        return NextResponse.json({ error: 'Client with this email already exists' }, { status: 409 });
      }
    }

    // Prevent duplicate by phone if provided
    if (phone) {
      const existing = await Client.findOne({ phone }).lean().exec();
      if (existing) {
        return NextResponse.json({ error: 'Client with this phone already exists' }, { status: 409 });
      }
    }

    const client = new Client({
      name,
      email: email || undefined,
      phone: phone || undefined,
      address: {
        firstName: address.firstName || undefined,
        lastName: address.lastName || undefined,
        line1: address.line1 || undefined,
        unit: address.unit || undefined,
        city: address.city || undefined,
        postcode: address.postcode || undefined,
        country: address.country || undefined,
      },
      // Don't set createdAt/updatedAt manually - timestamps: true handles this
    });

    console.log('Attempting to save client:', {
      name: client.name,
      email: client.email,
      phone: client.phone,
    });

    const saved = await client.save();
    console.log('Client saved successfully:', saved._id);

    // return lean object
    const obj = saved.toObject ? saved.toObject() : saved;
    return NextResponse.json(obj, { status: 201 });
  } catch (err) {
    console.error('Failed to create client:', err);

    // Handle Mongoose validation errors
    if (err && typeof err === 'object' && 'name' in err && 'errors' in err) {
      const error = err as { name: string; errors: Record<string, { path: string; message: string }> };
      if (error.name === 'ValidationError') {
        return NextResponse.json(
          {
            error: 'Validation failed',
            details: Object.values(error.errors).map((e) => ({
              field: e.path,
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }
    }

    // Handle duplicate key errors (unique constraint violations)
    if (err && typeof err === 'object' && 'code' in err && 'keyPattern' in err) {
      const error = err as { code: number; keyPattern: Record<string, unknown> };
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return NextResponse.json(
          {
            error: 'Duplicate entry',
            message: `A client with this ${field} already exists`,
            field,
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}