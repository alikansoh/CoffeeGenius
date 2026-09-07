import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import CoffeeVariant from "@/models/CoffeeVariant";
import Equipment from "@/models/Equipment";
import { validateAndApplyCoupon } from "@/lib/couponService";

interface ApplyBody {
  code: string;
  email?: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    productType?: "coffee" | "equipment";
  }>;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function resolveItem(
  item: ApplyBody["items"][number]
): Promise<{ id: string; productId?: string; variantId?: string }> {
  if (item.productType === "equipment") {
    const equip = await Equipment.findOne({
      $or: [{ _id: item.id }, { slug: item.id }],
    })
      .select("_id")
      .lean();
    const resolvedId = equip ? equip._id.toString() : item.id;
    return { id: resolvedId, productId: resolvedId };
  }

  if (mongoose.Types.ObjectId.isValid(item.id)) {
    const variant = await CoffeeVariant.findById(item.id)
      .select("coffeeId")
      .lean();
    if (variant?.coffeeId) {
      return {
        id: item.id,
        productId: variant.coffeeId.toString(),
        variantId: item.id,
      };
    }
  }

  return { id: item.id };
}

export async function POST(req: NextRequest) {
  try {
    const body: ApplyBody = await req.json();
    const { code, email, items } = body;

    if (!code || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Code and items are required" },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "A valid email is required to apply a coupon" },
        { status: 400 }
      );
    }

    const resolvedItems = await Promise.all(
      items.map(async (it) => ({
        ...it,
        ...(await resolveItem(it)),
      }))
    );

    const result = await validateAndApplyCoupon(resolvedItems, code, email);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired coupon" },
        { status: 404 }
      );
    }

    if (!result.valid) {
      return NextResponse.json({ success: false, result }, { status: 400 });
    }

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    console.error("❌ Error applying coupon:", error);
    return NextResponse.json(
      { error: "Failed to apply coupon" },
      { status: 500 }
    );
  }
}