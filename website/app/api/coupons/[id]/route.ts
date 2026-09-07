import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Coupon from "@/models/Coupon";
import { verifyAuthForApi } from "@/lib/auth";

function normalizeCode(code?: string): string | undefined {
  if (!code) return undefined;
  return code.trim().toUpperCase();
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();
    const { id } = await params;

    const coupon = await Coupon.findById(id).lean();
    if (!coupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, coupon }, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching coupon:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coupon" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await verifyAuthForApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
    const { id } = await params;
    const body = await req.json();

    const code = normalizeCode(body.code);

    if (code) {
      const existing = await Coupon.findOne({ code, _id: { $ne: id } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Coupon code already exists" },
          { status: 409 }
        );
      }
    }

    const updateFields: Record<string, unknown> = {
      code,
      name: body.name.trim(),
      description: body.description?.trim(),
      type: body.type,
      isActive: body.isActive,
      isAutomatic: body.isAutomatic,
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
    };

    // Remove undefined values so Mongoose doesn't set them to null
    Object.keys(updateFields).forEach((key) => {
      if (updateFields[key] === undefined) {
        delete updateFields[key];
      }
    });

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).lean();

    if (!coupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, coupon }, { status: 200 });
  } catch (error) {
    console.error("❌ Error updating coupon:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update coupon" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await verifyAuthForApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
    const { id } = await params;
    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Coupon deleted" }, { status: 200 });
  } catch (error) {
    console.error("❌ Error deleting coupon:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete coupon" },
      { status: 500 }
    );
  }
}