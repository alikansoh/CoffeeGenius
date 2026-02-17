import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";

export async function GET() {
  try {
    await dbConnect();

    const mongoose = (await import("mongoose")).default;
    await mongoose.connection
      .collection("coffeevariants")
      .dropIndex("coffeeId_1_sizeGrams_1_grind_1");

    return NextResponse.json({ success: true, message: "Index dropped successfully" });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
