import { NextRequest, NextResponse } from "next/server";
import CoffeeVariant, { ICoffeeVariant } from "@/models/CoffeeVariant";
import Coffee from "@/models/Coffee";
import dbConnect from "@/lib/dbConnect";
import { Types } from "mongoose";
import { verifyAuthForApi } from "@/lib/auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * GET /api/variants/[id]
 * Fetch variant by ID
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    await dbConnect();

    const { id } = await params;

    console.log("Fetching variant with ID:", id);

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid variant ID format",
          id,
        },
        { status: 400 }
      );
    }

    const variant = await CoffeeVariant.findById(id).populate("coffeeId");

    if (!variant) {
      return NextResponse.json(
        {
          success: false,
          message: "Variant not found",
          id,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: variant,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching variant:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch variant",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/variants/[id]
 * Update variant by ID
 */
export async function PUT(request: NextRequest, { params }: Props) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for PUT /api/variants/[id]", err);
    return NextResponse.json({ success: false, message: "Authentication failed" }, { status: 401 });
  }

  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();

    console.log("Updating variant with ID:", id);

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid variant ID format",
          id,
        },
        { status: 400 }
      );
    }

    const variant = await CoffeeVariant.findById(id);

    if (!variant) {
      return NextResponse.json(
        {
          success: false,
          message: "Variant not found",
          id,
        },
        { status: 404 }
      );
    }

    const coffeeId = variant.coffeeId;
    const updatableFields = ["size", "grind", "price", "stock"];
    const updateData: Partial<Pick<ICoffeeVariant, "size" | "grind" | "price" | "stock">> = {};

    for (const field of updatableFields) {
      if (field in body) {
        updateData[field as keyof typeof updateData] = body[field];
      }
    }

    const updatedVariant = await CoffeeVariant.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    const allVariants = await CoffeeVariant.find({ coffeeId });
    const prices = allVariants.map((v) => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const totalStock = allVariants.reduce((sum, v) => sum + v.stock, 0);
    const grinds = [...new Set(allVariants.map((v) => v.grind))];
    const availableSizes = [...new Set(allVariants.map((v) => v.size))];

    const updatedCoffee = await Coffee.findByIdAndUpdate(
      coffeeId,
      {
        minPrice,
        maxPrice,
        totalStock,
        grinds,
        availableSizes,
      },
      { new: true }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Variant updated successfully.  Coffee stats recalculated.",
        data: {
          variant: updatedVariant,
          coffee: {
            id: updatedCoffee._id,
            minPrice,
            maxPrice,
            totalStock,
            availableGrinds: grinds,
            availableSizes,
            variantCount: allVariants.length,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating variant:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update variant",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/variants/[id]
 * Delete variant by ID
 */
export async function DELETE(request: NextRequest, { params }: Props) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for DELETE /api/variants/[id]", err);
    return NextResponse.json({ success: false, message: "Authentication failed" }, { status: 401 });
  }

  try {
    await dbConnect();

    const { id } = await params;

    console.log("Deleting variant with ID:", id);

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid variant ID format",
          id,
        },
        { status: 400 }
      );
    }

    const variant = await CoffeeVariant.findById(id);

    if (!variant) {
      return NextResponse.json(
        {
          success: false,
          message: "Variant not found",
          id,
        },
        { status: 404 }
      );
    }

    const coffeeId = variant.coffeeId;
    await CoffeeVariant.findByIdAndDelete(id);

    const remainingVariants = await CoffeeVariant.find({ coffeeId });

    if (remainingVariants.length === 0) {
      await Coffee.findByIdAndDelete(coffeeId);

      return NextResponse.json(
        {
          success: true,
          message: "Variant deleted.  No variants remaining, coffee deleted too.",
        },
        { status: 200 }
      );
    } else {
      const prices = remainingVariants.map((v) => v.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const totalStock = remainingVariants.reduce((sum, v) => sum + v.stock, 0);
      const grinds = [...new Set(remainingVariants.map((v) => v.grind))];
      const availableSizes = [...new Set(remainingVariants.map((v) => v.size))];

      const updatedCoffee = await Coffee.findByIdAndUpdate(
        coffeeId,
        {
          minPrice,
          maxPrice,
          totalStock,
          grinds,
          availableSizes,
        },
        { new: true }
      );

      return NextResponse.json(
        {
          success: true,
          message: "Variant deleted successfully.  Coffee stats updated.",
          data: {
            coffeeId,
            minPrice,
            maxPrice,
            totalStock,
            availableGrinds: grinds,
            availableSizes,
            variantsRemaining: remainingVariants.length,
          },
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Error deleting variant:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete variant",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}