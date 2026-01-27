'use server';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import mongoose from 'mongoose';

interface Suggestion {
  _id: unknown;
  shippingAddress?: { firstName?: string; lastName?: string };
  billingAddress?: { email?: string };
  total?: number;
  paymentIntentId?: string;
  status?: string;
}

/**
 * GET /api/orders
 * - Supports improved search via `q` and `field` (auto|orderId|clientId|paymentIntent|emailName|item|tracking|all)
 * - Supports lightweight suggestions when `suggest=1` (returns small set for autocomplete)
 * - New optional filters: from (ISO date), to (ISO date), minTotal, maxTotal
 *
 * Query params:
 *  - page (default 1)
 *  - limit (default 20)
 *  - status (optional)
 *  - q (optional)
 *  - field (optional) — one of: auto|orderId|clientId|paymentIntent|emailName|item|tracking
 *  - sort (optional) e.g. -createdAt or createdAt
 *  - suggest (optional) if "1" returns compact suggestion objects
 *  - from / to (optional ISO dates) — filter createdAt range
 *  - minTotal / maxTotal (optional numbers)
 */
export async function GET(req: Request) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const status = url.searchParams.get('status') ?? undefined;
    const qRaw = url.searchParams.get('q') ?? undefined;
    const sort = url.searchParams.get('sort') ?? '-createdAt';
    const field = (url.searchParams.get('field') ?? 'auto').toLowerCase();
    const suggest = url.searchParams.get('suggest') === '1';
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;
    const minTotal = url.searchParams.get('minTotal') ? parseFloat(String(url.searchParams.get('minTotal'))) : undefined;
    const maxTotal = url.searchParams.get('maxTotal') ? parseFloat(String(url.searchParams.get('maxTotal'))) : undefined;

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') filter.status = status;

    // Date range
    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) (filter.createdAt as Record<string, unknown>).$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) (filter.createdAt as Record<string, unknown>).$lte = d;
      }
      // If createdAt ended up empty, remove it
      if (Object.keys(filter.createdAt as Record<string, unknown>).length === 0) delete filter.createdAt;
    }

    // Totals range
    if (minTotal !== undefined || maxTotal !== undefined) {
      filter.total = {};
      if (!Number.isNaN(minTotal as number) && minTotal !== undefined) (filter.total as Record<string, unknown>).$gte = minTotal;
      if (!Number.isNaN(maxTotal as number) && maxTotal !== undefined) (filter.total as Record<string, unknown>).$lte = maxTotal;
      if (Object.keys(filter.total as Record<string, unknown>).length === 0) delete filter.total;
    }

    // Build search clauses depending on "field" and "q"
    const q = qRaw?.trim();
    if (q && q.length > 0) {
      const searchClauses: Record<string, unknown>[] = [];

      // Utility: escaped query for RegExp construction
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const isHex24 = /^[0-9a-fA-F]{24}$/.test(q);
      // safe regex object (try/catch in case of weird locales or invalid patterns)
      let regexObj: RegExp | null = null;
      try {
        // For auto we use loose matching; for targeted searches we may anchor (see below)
        regexObj = new RegExp(escaped, 'i');
      } catch {
        regexObj = null;
      }

      // Helper for short-id / trailing match for ObjectId-like strings
      const pushTrailingIdExpr = (fieldName: string) => {
        try {
          searchClauses.push({
            $expr: {
              $regexMatch: {
                input: { $toString: `$${fieldName}` },
                regex: escaped + '$',
                options: 'i',
              },
            },
          });
        } catch {
          // ignore if $expr/$regexMatch is unsupported
        }
      };

      // Field-scoped behavior
      switch (field) {
        case 'orderid':
          if (isHex24) {
            try {
              searchClauses.push({ _id: new mongoose.Types.ObjectId(q) });
            } catch {
              // ignore
            }
          }
          // trailing match on stringified _id (short ids)
          pushTrailingIdExpr('_id');
          break;

        case 'clientid':
          if (isHex24) {
            try {
              searchClauses.push({ clientId: new mongoose.Types.ObjectId(q) });
            } catch {
              // ignore cast
            }
          }
          pushTrailingIdExpr('clientId');
          if (regexObj) {
            // In some schemas clientId may be a string — only include regex if so.
            searchClauses.push({ clientId: regexObj });
          }
          break;

        case 'paymentintent':
          // paymentIntentId usually a string. Allow exact and regex.
          searchClauses.push({ paymentIntentId: q });
          if (regexObj) searchClauses.push({ paymentIntentId: regexObj });
          break;

        case 'emailname':
          if (regexObj) {
            searchClauses.push(
              { 'shippingAddress.email': regexObj },
              { 'billingAddress.email': regexObj },
              { 'shippingAddress.firstName': regexObj },
              { 'shippingAddress.lastName': regexObj },
              { 'billingAddress.firstName': regexObj },
              { 'billingAddress.lastName': regexObj }
            );
          }
          break;

        case 'item':
          if (regexObj) {
            searchClauses.push({ 'items.name': regexObj }, { 'items.source': regexObj });
          }
          break;

        case 'tracking':
          if (regexObj) {
            searchClauses.push({ 'shipment.trackingCode': regexObj }, { 'shipment.provider': regexObj });
          }
          break;

        case 'auto':
        default:
          // Auto: try to pick the best approach
          // 1) full ObjectId exact match if it looks like one
          if (isHex24) {
            try {
              const objId = new mongoose.Types.ObjectId(q);
              searchClauses.push({ _id: objId });
              searchClauses.push({ clientId: objId });
            } catch {
              // ignore
            }
          }

          // 2) If query is numeric, match totals
          const num = parseFloat(q);
          if (!Number.isNaN(num) && Number.isFinite(num)) {
            searchClauses.push({ total: num }, { subtotal: num });
          }

          // 3) Preferred: $text search (when user has created a text index). Use for longer queries.
          if (q.length >= 3) {
            try {
              searchClauses.push({ $text: { $search: q } });
            } catch {
              // ignore if not supported
            }
          }

          // 4) Regex fallbacks for a variety of string fields (safe: do NOT regex on ObjectId fields)
          if (regexObj) {
            searchClauses.push(
              { 'shippingAddress.firstName': regexObj },
              { 'shippingAddress.lastName': regexObj },
              { 'billingAddress.firstName': regexObj },
              { 'billingAddress.lastName': regexObj },
              { 'shippingAddress.email': regexObj },
              { 'billingAddress.email': regexObj },
              { 'shippingAddress.phone': regexObj },
              { 'billingAddress.phone': regexObj },
              { 'shippingAddress.line1': regexObj },
              { 'billingAddress.line1': regexObj },
              { 'shippingAddress.unit': regexObj },
              { 'shippingAddress.city': regexObj },
              { 'shippingAddress.postcode': regexObj },
              { 'billingAddress.city': regexObj },
              { 'billingAddress.postcode': regexObj },
              { paymentIntentId: regexObj },
              { 'items.name': regexObj },
              { 'items.source': regexObj },
              { 'shipment.trackingCode': regexObj },
              { 'shipment.provider': regexObj },
              { 'refund.refundId': regexObj },
              { status: regexObj }
            );

            // add short-id trailing matches on stringified ids
            pushTrailingIdExpr('_id');
            pushTrailingIdExpr('clientId');
          }
          break;
      }

      if (searchClauses.length > 0) {
        // combine existing filter with search $or
        filter.$or = searchClauses;
      }
    }

    const skip = (page - 1) * limit;

    // Suggest mode: return a light-weight selection for autocomplete
    if (suggest) {
      // limit to small number and return compact fields
      const suggestions = await Order.find(filter)
        .sort(sort)
        .limit(Math.min(12, limit))
        .select({ _id: 1, 'shippingAddress.firstName': 1, 'shippingAddress.lastName': 1, 'billingAddress.email': 1, total: 1, paymentIntentId: 1, status: 1 })
        .lean()
        .exec() as Suggestion[];

      // format minimal suggestion objects
      const payload = suggestions.map((s: Suggestion) => ({
        id: String(s._id),
        name: [s.shippingAddress?.firstName, s.shippingAddress?.lastName].filter(Boolean).join(' ') || null,
        email: s.billingAddress?.email || null,
        total: s.total ?? null,
        paymentIntentId: s.paymentIntentId ?? null,
        status: s.status ?? null,
      }));

      return NextResponse.json({ suggestions: payload }, { status: 200 });
    }

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