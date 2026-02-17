import { NextRequest, NextResponse } from "next/server";
import CoffeeVariant from "@/models/CoffeeVariant";
import dbConnect from "@/lib/dbConnect";
import { verifyAuthForApi } from "@/lib/auth";

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, string>;
}

/**
 * GET /api/variants
 * Get all variants
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const coffeeId = searchParams.get("coffeeId");

    const query = coffeeId ? { coffeeId } : {};
    const variants = await CoffeeVariant.find(query).populate("coffeeId");

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
 * Create new variant (protected - requires authentication)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
  } catch (err) {
    console.error("Auth check failed for POST /api/variants", err);
    return NextResponse.json(
      { success: false, message: "Authentication failed" },
      { status: 401 }
    );
  }

  try {
    await dbConnect();

    const body = await request.json();

    const { coffeeId, sku, size, grind, price, stock, img } = body;

    if (!coffeeId || !sku || !size || !grind || price === undefined || stock === undefined) {
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

    const mongoError = error as MongoError;

    if (mongoError?.code === 11000) {
      const keyValue = mongoError.keyValue ?? {};

      if (keyValue.sku) {
        return NextResponse.json(
          {
            success: false,
            message: `SKU "${keyValue.sku}" already exists. Please use a unique SKU.`,
          },
          { status: 409 }
        );
      }

      if (keyValue.size || keyValue.grind) {
        return NextResponse.json(
          {
            success: false,
            message: "A variant with this size and grind already exists for this coffee.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "A duplicate variant already exists.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create variant",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}