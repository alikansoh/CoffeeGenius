import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import { notifyReviewRequest } from '@/lib/notifyReviewRequest';

const CRON_SECRET = process.env.CRON_SECRET;

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${CRON_SECRET}`;
}

interface OrderItemLike {
  id?: string;
  name?: string;
  qty?: number;
  source?: string;
}

/** Best-effort: an order item only stores {id, name, qty, source} — the product image lives
 *  on the CoffeeVariant/Coffee/Equipment doc itself, looked up by id+source. A missing/renamed
 *  product just means that one item renders without a thumbnail, not a failed email. */
async function resolveItemImages(
  items: OrderItemLike[]
): Promise<{ name: string; qty: number; imagePublicId?: string }[]> {
  return Promise.all(
    items.map(async (item) => {
      const name = item.name || 'Item';
      const qty = item.qty || 1;
      if (!item.id) return { name, qty };

      try {
        let imagePublicId: string | undefined;
        if (item.source === 'coffee') {
          const doc = await Coffee.findById(item.id).select('img').lean();
          imagePublicId = doc?.img;
        } else if (item.source === 'equipment') {
          const doc = await Equipment.findById(item.id).select('img').lean();
          imagePublicId = doc?.img;
        } else {
          // 'variant' (the default/most common case) or unset — variants often don't carry
          // their own image, so fall back to the parent Coffee's image when the variant has none.
          const doc = await CoffeeVariant.findById(item.id).select('img coffeeId').lean();
          imagePublicId = doc?.img;
          if (!imagePublicId && doc?.coffeeId) {
            const coffee = await Coffee.findById(doc.coffeeId).select('img').lean();
            imagePublicId = coffee?.img;
          }
        }
        return { name, qty, imagePublicId };
      } catch {
        return { name, qty };
      }
    })
  );
}

/**
 * GET /api/cron/review-requests
 * Runs daily (see vercel.json) — emails customers asking for a Google/Trustpilot review once
 * their order has been marked shipped for at least 3 days. Sent exactly once per order, tracked
 * via metadata.reviewRequestSent (mirrors the pattern used by the invoice-reminders cron).
 */
export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
      status: 'shipped',
      'shipment.shippedAt': { $exists: true, $ne: null, $lte: threeDaysAgo },
      'metadata.reviewRequestSent': { $ne: true },
    }).lean();

    const sent: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      const email = order.shippingAddress?.email || order.client?.email;
      const name =
        [order.shippingAddress?.firstName, order.shippingAddress?.lastName].filter(Boolean).join(' ') ||
        order.client?.name ||
        '';
      const orderNumber =
        (order.metadata as Record<string, unknown> | undefined)?.orderNumber as string | undefined;

      if (!email) {
        errors.push(`${order._id}: missing customer email`);
        continue;
      }

      try {
        const items = await resolveItemImages(order.items || []);

        const result = await notifyReviewRequest({
          email,
          name,
          orderNumber: orderNumber || String(order._id).slice(-8).toUpperCase(),
          items,
        });

        if (!result.sent) {
          errors.push(`${order._id}: ${result.error}`);
          continue;
        }

        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'metadata.reviewRequestSent': true,
            'metadata.reviewRequestSentAt': new Date().toISOString(),
          },
        });

        sent.push(String(order._id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${order._id}: ${msg}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        checked: orders.length,
        sent,
        errors,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error running review-request cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to run review-request cron',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
