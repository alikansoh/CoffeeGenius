import { NextRequest, NextResponse } from "next/server";
import CoffeeVariant from "@/models/CoffeeVariant";
import dbConnect from "@/lib/dbConnect";

/**
 * GET /api/variants
 * Get all variants
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const variants = await CoffeeVariant.find(). populate("coffeeId");

    return NextResponse.json(
      {
        success: true,
        data: variants,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching variants:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch variants",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/variants
 * Create new variant
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();

    // Create new variant
    const {
      coffeeId,
      sku,
      size,
      grind,
      price,
      stock,
      img,
    } = body;

    // Validate required fields
    if (!  coffeeId || !  sku || ! size || !grind || price === undefined || stock === undefined) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: coffeeId, sku, size, grind, price, stock",
        },
        { status: 400 }
      );
    }

    const variant = new CoffeeVariant({
      coffeeId,
      sku,
      size,
      grind,
      price,
      stock,
      img,
    });

    await variant.save();
    await variant.populate("coffeeId");

    return NextResponse.json(
      {
        success: true,
        message: "Variant created successfully",
        data: variant,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating variant:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create variant",
        error: error instanceof Error ?   error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}