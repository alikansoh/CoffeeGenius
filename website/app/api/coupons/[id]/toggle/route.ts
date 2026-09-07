import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Coupon from "@/models/Coupon";
import { verifyAuthForApi } from "@/lib/auth";
import mongoose from "mongoose";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuthForApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return NextResponse.json(
      { success: true, isActive: coupon.isActive },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error toggling coupon:", error);
    return NextResponse.json(
      { success: false, error: "Failed to toggle coupon" },
      { status: 500 }
    );
  }
}