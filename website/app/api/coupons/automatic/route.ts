import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import Coupon, { ICoupon } from "@/models/Coupon";
import CoffeeVariant from "@/models/CoffeeVariant";
import Equipment from "@/models/Equipment";
import dbConnect from "@/lib/dbConnect";
import { calculateDiscount } from "@/lib/couponService";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  productType?: "coffee" | "equipment";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function resolveItem(
  item: CartItem
): Promise<{ id: string; productId?: string; variantId?: string }> {
  if (item.productType === "equipment") {
    const equip = await Equipment.findOne({ $or: [{ _id: item.id }, { slug: item.id }] })
      .select("_id")
      .lean();
    const resolvedId = equip ? equip._id.toString() : item.id;
    return { id: resolvedId, productId: resolvedId };
  }

  if (mongoose.Types.ObjectId.isValid(item.id)) {
    const variant = await CoffeeVariant.findById(item.id).select("coffeeId").lean();
    if (variant?.coffeeId) {
      return { id: item.id, productId: variant.coffeeId.toString(), variantId: item.id };
    }
  }

  return { id: item.id };
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const { email, items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items required" }, { status: 400 });
    }

    const now = new Date();

    const automaticCoupons = await Coupon.find({
      isActive: true,
      isAutomatic: true,
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] },
      ],
    }).lean();

    const resolvedItems = await Promise.all(
      items.map(async (it) => ({
        ...it,
        ...(await resolveItem(it)),
      }))
    );

    let bestResult: {
      code: string;
      name: string;
      discountAmount: number;
      couponId: string;
    } | null = null;

    for (const coupon of automaticCoupons) {
      const result = calculateDiscount(resolvedItems, coupon as unknown as ICoupon);

      if (
        result.valid &&
        result.discountAmount > 0 &&
        (!bestResult || result.discountAmount > bestResult.discountAmount)
      ) {
        bestResult = {
          code: coupon.code || "",
          name: result.name,
          discountAmount: result.discountAmount,
          couponId: result.couponId || "",
        };
      }
    }

    return NextResponse.json({ automaticCoupon: bestResult }, { status: 200 });
  } catch (error) {
    console.error("Automatic coupon error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}