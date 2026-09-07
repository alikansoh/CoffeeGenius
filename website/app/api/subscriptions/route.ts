import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Subscription from "@/models/Subscription";

/**
 * GET /api/subscriptions
 * Lists subscriptions for the admin subscriptions page.
 *
 * Query params:
 *  - page (default 1)
 *  - limit (default 20)
 *  - status (optional) — incomplete|active|past_due|canceled|unpaid
 *  - q (optional) — matches email, name, or variantLabel
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim();

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ email: re }, { name: re }, { variantLabel: re }];
    }

    const [items, total, statusCounts] = await Promise.all([
      Subscription.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Subscription.countDocuments(filter),
      Subscription.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts as { _id: string; count: number }[]) {
      counts[row._id] = row.count;
    }

    return NextResponse.json(
      {
        success: true,
        subscriptions: items,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        counts,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error listing subscriptions:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}
