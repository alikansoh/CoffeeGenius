import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Coupon from "@/models/Coupon";
import { verifyAuthForApi } from "@/lib/auth";

function normalizeCode(code?: string): string | undefined {
  if (!code) return undefined;
  return code.trim().toUpperCase();
}

export async function GET() {
  try {
    await dbConnect();
    const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, coupons }, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching coupons:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuthForApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
    const body = await req.json();

    const code = normalizeCode(body.code);

    if (code) {
      const existing = await Coupon.findOne({ code });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Coupon code already exists" },
          { status: 409 }
        );
      }
    }

    const coupon = await Coupon.create({
      code,
      name: body.name.trim(),
      description: body.description?.trim(),
      type: body.type,
      isActive: body.isActive ?? true,
      isAutomatic: body.isAutomatic ?? false,
      nthItem: body.nthItem,
      spendThreshold: body.spendThreshold,
      buyXGetY: body.buyXGetY,
      productDiscount: body.productDiscount,
      subscriptionIntro: body.subscriptionIntro,
      minimumOrderAmount: body.minimumOrderAmount,
      usageLimit: body.usageLimit,
      maxUsagePerUser: body.maxUsagePerUser,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      appliesTo: body.appliesTo || "all",
      productIds: body.productIds || [],
    });

    return NextResponse.json({ success: true, coupon }, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating coupon:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create coupon" },
      { status: 500 }
    );
  }
}