import { NextRequest, NextResponse } from "next/server";
import { validateAndApplyCoupon } from "@/lib/couponService";

interface ValidateBody {
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

export async function POST(req: NextRequest) {
  try {
    const body: ValidateBody = await req.json();
    const { code, email, items } = body;

    if (!code || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Code and items are required" },
        { status: 400 }
      );
    }

    const result = await validateAndApplyCoupon(items, code, email);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired coupon" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    console.error("❌ Error validating coupon:", error);
    return NextResponse.json(
      { error: "Failed to validate coupon" },
      { status: 500 }
    );
  }
}