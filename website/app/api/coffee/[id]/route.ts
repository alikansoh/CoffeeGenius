import { NextRequest, NextResponse } from "next/server";
import Coffee from "@/models/Coffee";
import CoffeeVariant from "@/models/CoffeeVariant";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";

interface SizePrice {
  size: string;
  price: number;
}

interface CoffeeVariantData {
  _id: string;
  size: string;
  grind: string;
  price: number;
  stock: number;
  coffeeId: string;
}

interface CoffeeDetail {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  roastLevel: "light" | "medium" | "dark";
  img: string;
  notes?: string;
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt: Date;
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  availableSizes: SizePrice[];
  totalStock: number;
  variants: CoffeeVariantData[];
}

/**
 * GET /api/coffee/[id]
 * Get a single coffee by ID or slug with all variant details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id: coffeeId } = await params;

    if (!coffeeId) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee ID is required",
        },
        { status: 400 }
      );
    }

    const isValidObjectId = mongoose.Types.ObjectId.isValid(coffeeId);

    // ✅ Build match filter to search by slug OR _id
    const matchFilter: { $or: Array<{ slug?: string; _id?: mongoose. Types.ObjectId }> } = {
      $or: [{ slug: coffeeId. toLowerCase() }],
    };

    if (isValidObjectId) {
      matchFilter.$or. push({ _id: new mongoose. Types.ObjectId(coffeeId) });
    }

    const coffees = (await Coffee.aggregate([
      {
        $match: matchFilter,
      },
      {
        $lookup: {
          from: "coffeevariants",
          localField: "_id",
          foreignField: "coffeeId",
          as: "variants",
        },
      },
      {
        $addFields: {
          variantCount: { $size: "$variants" },
          minPrice: {
            $cond: {
              if: { $gt: [{ $size: "$variants" }, 0] },
              then: {
                $reduce: {
                  input: "$variants",
                  initialValue: 999999,
                  in: { $min: ["$$value", "$$this.price"] },
                },
              },
              else: 0,
            },
          },
          availableGrinds: {
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              {
                $reduce: {
                  input: "$variants",
                  initialValue: [],
                  in: {
                    $cond: [
                      { $in: ["$$this.grind", "$$value"] },
                      "$$value",
                      {
                        $concatArrays: ["$$value", ["$$this.grind"]],
                      },
                    ],
                  },
                },
              },
              [],
            ],
          },
          totalStock: {
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              { $sum: "$variants.stock" },
              0,
            ],
          },
          bestSeller: {
            $ifNull: ["$bestSeller", false],
          },
        },
      },
      {
        $project: {
          _id: 1,
          slug: 1,
          name: 1,
          origin: 1,
          roastLevel: 1,
          img: 1,
          notes: 1,
          process: 1,
          altitude: 1,
          harvest: 1,
          cupping_score: 1,
          variety: 1,
          brewing: 1,
          bestSeller: 1,
          variantCount: 1,
          minPrice: 1,
          availableGrinds: 1,
          totalStock: 1,
          createdAt: 1,
          variants: 1,
        },
      },
    ])) as CoffeeDetail[];

    if (! coffees.length) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee not found",
        },
        { status: 404 }
      );
    }

    const coffee = coffees[0];

    const sizeMap = new Map<string, number>();
    coffee.variants. forEach((variant: CoffeeVariantData) => {
      const currentPrice = sizeMap.get(variant.size);
      if (currentPrice === undefined || variant. price < currentPrice) {
        sizeMap.set(variant. size, variant.price);
      }
    });

    const availableSizes: SizePrice[] = Array.from(sizeMap.entries())
      .map(([size, price]) => ({ size, price }))
      . sort((a, b) => {
        const sizeOrder: Record<string, number> = {
          "250g": 1,
          "500g": 2,
          "1kg": 3,
        };
        return (sizeOrder[a.size] || 999) - (sizeOrder[b.size] || 999);
      });

    const calculatedMinPrice =
      coffee.variants.length > 0
        ? Math.min(...coffee.variants.map((v: CoffeeVariantData) => v.price))
        : 0;

    const transformedCoffee: CoffeeDetail = {
      ...coffee,
      availableSizes,
      minPrice:
        coffee.minPrice > 0 && coffee.minPrice < 999999
          ? coffee. minPrice
          : calculatedMinPrice,
    };

    return NextResponse.json(
      {
        success: true,
        data: transformedCoffee,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching coffee:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch coffee details",
        error: error instanceof Error ?  error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/coffee/[id]
 * Update a coffee by ID or slug (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id: coffeeId } = await params;

    if (!coffeeId) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee ID is required",
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const {
      slug,
      name,
      origin,
      notes,
      img,
      images,
      roastLevel,
      process,
      altitude,
      harvest,
      cupping_score,
      variety,
      brewing,
      bestSeller,
    } = body;

    interface UpdateCoffeeData {
      slug?: string;
      name?: string;
      origin?: string;
      notes?: string;
      img?: string;
      images?: string[];
      roastLevel?: "light" | "medium" | "dark";
      process?: string;
      altitude?: string;
      harvest?: string;
      cupping_score?: number;
      variety?: string;
      brewing?: string;
      bestSeller?: boolean;
    }

    const updateData: UpdateCoffeeData = {};
    if (slug !== undefined) updateData.slug = slug;
    if (name !== undefined) updateData.name = name;
    if (origin !== undefined) updateData.origin = origin;
    if (notes !== undefined) updateData.notes = notes;
    if (img !== undefined) updateData. img = img;
    if (images !== undefined) updateData.images = images;
    if (roastLevel !== undefined) updateData. roastLevel = roastLevel;
    if (process !== undefined) updateData.process = process;
    if (altitude !== undefined) updateData.altitude = altitude;
    if (harvest !== undefined) updateData.harvest = harvest;
    if (cupping_score !== undefined) updateData.cupping_score = cupping_score;
    if (variety !== undefined) updateData. variety = variety;
    if (brewing !== undefined) updateData.brewing = brewing;
    if (bestSeller !== undefined) updateData. bestSeller = bestSeller;

    // ✅ Try to find by slug first, then by ID
    let coffee = await Coffee.findOne({ slug: coffeeId.toLowerCase() });

    if (!coffee && mongoose.Types.ObjectId.isValid(coffeeId)) {
      coffee = await Coffee.findById(coffeeId);
    }

    if (!coffee) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee not found",
        },
        { status: 404 }
      );
    }

    // ✅ Update coffee
    Object.assign(coffee, updateData);
    await coffee.save();

    console.log("✅ Updated coffee, bestSeller:", coffee.bestSeller);

    return NextResponse.json(
      {
        success: true,
        message: "Coffee updated successfully",
        data: coffee,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating coffee:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update coffee",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id: coffeeId } = await params;

    if (! coffeeId) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee ID is required",
        },
        { status: 400 }
      );
    }

    // ✅ Try to find by slug first, then by ID
    let coffee = await Coffee.findOne({ slug: coffeeId.toLowerCase() });

    if (!coffee && mongoose.Types.ObjectId.isValid(coffeeId)) {
      coffee = await Coffee.findById(coffeeId);
    }

    if (!coffee) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee not found",
        },
        { status: 404 }
      );
    }

    // ✅ Delete all variants associated with this coffee
    const deletedVariants = await CoffeeVariant.deleteMany({
      coffeeId: coffee._id,
    });

    // ✅ Delete the coffee
    await Coffee.findByIdAndDelete(coffee._id);

    return NextResponse.json(
      {
        success: true,
        message: "Coffee deleted successfully",
        data: {
          coffeeId: coffee._id,
          coffeeName: coffee.name,
          variantsDeleted: deletedVariants.deletedCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting coffee:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete coffee",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}