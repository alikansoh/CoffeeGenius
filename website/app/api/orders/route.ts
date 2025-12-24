'use server';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';

/**
 * GET /api/orders
 * Query parameters:
 *  - page (default 1)
 *  - limit (default 20)
 *  - status (optional) e.g. pending, paid
 *  - q (optional text search on client name, email, order id)
 *  - sort (optional) e.g. -createdAt or createdAt
 *
 * Security: restrict to admins or return only current user's orders.
 */
export async function GET(req: Request) {
  try {
    // Example authorization placeholder:
    // const user = await getUserFromRequest(req);
    // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // if (!user.isAdmin) { ... restrict to user's orders ... }
    // Replace above with your real auth.

    await dbConnect();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const status = url.searchParams.get('status') ?? undefined;
    const q = url.searchParams.get('q') ?? undefined;
    const sort = url.searchParams.get('sort') ?? '-createdAt';

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    if (q) {
      // try orderId exact match first
      if (/^[0-9a-fA-F]{24}$/.test(q)) {
        filter._id = q;
      } else {
        // text search across client email/name or shipping name
        filter.$or = [
          { 'client.email': { $regex: q, $options: 'i' } },
          { 'client.name': { $regex: q, $options: 'i' } },
          { 'shippingAddress.line1': { $regex: q, $options: 'i' } },
          { 'items.name': { $regex: q, $options: 'i' } },
        ];
      }
    }

    // Authorization example: limit to current user's orders
    // const userId = getUserIdFromRequest(req);
    // if (!user.isAdmin) filter['client.email'] = user.email;

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Order.countDocuments(filter),
    ]);

    const pages = Math.ceil(total / limit);

    return NextResponse.json({ data: orders, meta: { total, page, limit, pages } }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /api/orders error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}