import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import CoffeeVariant from "@/models/CoffeeVariant";
import { computeSubscriptionChargeWithDelivery } from "@/lib/subscriptionPricing";

/**
 * GET /api/subscriptions/price-preview?variantId=...
 * Public, read-only, no Stripe calls — used by the product page to show the real per-delivery
 * price (coffee price + any subscription delivery fee) *before* the customer clicks Subscribe,
 * so the price shown on the page always matches what /api/subscriptions/create actually
 * charges. Cheap enough to call on every variant selection change.
 */
export async function GET(req: NextRequest) {
  try {
    const variantId = req.nextUrl.searchParams.get("variantId");
    if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
      return NextResponse.json({ error: "Valid variantId is required" }, { status: 400 });
    }

    await dbConnect();
    const variant = await CoffeeVariant.findById(variantId)
      .select("price subscriptionDiscountPercent subscriptionEnabled")
      .lean();

    if (!variant || !variant.subscriptionEnabled) {
      return NextResponse.json({ error: "Not available as a subscription" }, { status: 404 });
    }

    const { subscriptionPrice, basePrice, shippingPencePerCycle } =
      await computeSubscriptionChargeWithDelivery(variant);

    return NextResponse.json(
      { subscriptionPrice, basePrice, shippingPencePerCycle },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error computing subscription price preview:", error);
    return NextResponse.json({ error: "Failed to compute price" }, { status: 500 });
  }
}
