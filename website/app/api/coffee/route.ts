import { NextRequest, NextResponse } from "next/server";
import Coffee from "@/models/Coffee";
import dbConnect from "@/lib/dbConnect";
import { verifyAuthForApi } from "@/lib/auth";

interface SizePrice {
  size: string;
  price: number;
  availableGrinds: string[];
  totalStock: number;
}

interface CoffeeVariantData {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  price: number;
  stock: number;
  img: string;
  createdAt: string;
  updatedAt: string;
}

interface CoffeeAggregateResult {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  roastLevel: "light" | "medium" | "dark";
  img: string;
  images?: string[];
  notes?: string;
  story?: string;
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: CoffeeVariantData[];
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  totalStock: number;
}

interface TransformedCoffee {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  roastLevel: "light" | "medium" | "dark";
  img: string;
  images?: string[];
  notes?: string;
  story?: string;
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt: Date;
  updatedAt: Date;
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  availableSizes: SizePrice[];
  totalStock: number;
  variants: CoffeeVariantData[];
}

/**
 * GET /api/coffee
 * Get all coffees with variant count, base price, and available sizes with prices and grinds
 * Query params: search, limit, page, bestSeller
 *
 * PROTECTED: Requires an authenticated user.
 */
export async function GET(request: NextRequest) {
 
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 100);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const bestSeller = searchParams.get("bestSeller");

    // Build search filter
    const matchFilter: Record<string, unknown> = {};

    if (search) {
      matchFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { origin: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { story: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by best seller if requested
    if (bestSeller === "true") {
      matchFilter.bestSeller = true;
    }

    const skip = (page - 1) * limit;

    // Get coffees with aggregation to include variant data
    const coffees = (await Coffee.aggregate([
      ...(Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : []),
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
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              { $min: "$variants.price" },
              0,
            ],
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
                      { $concatArrays: ["$$value", ["$$this.grind"]] },
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
          // Ensure bestSeller has a boolean default
          bestSeller: { $ifNull: ["$bestSeller", false] },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          slug: 1,
          name: 1,
          origin: 1,
          notes: 1,
          story: 1,
          img: 1,
          images: 1,
          roastLevel: 1,
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
          updatedAt: 1,
          variants: 1,
        },
      },
    ])) as CoffeeAggregateResult[];

    // Transform coffees to extract availableSizes with their available grinds
    const transformedCoffees: TransformedCoffee[] = coffees.map((coffee) => {
      const sizeMap = new Map<
        string,
        { price: number; grinds: Set<string>; totalStock: number }
      >();

      coffee.variants.forEach((variant: CoffeeVariantData) => {
        if (!sizeMap.has(variant.size)) {
          sizeMap.set(variant.size, {
            price: variant.price,
            grinds: new Set(),
            totalStock: 0,
          });
        }

        const sizeData = sizeMap.get(variant.size)!;

        // Set minimum price for this size
        if (variant.price < sizeData.price) {
          sizeData.price = variant.price;
        }

        // Add grind option
        sizeData.grinds.add(variant.grind);

        // Accumulate stock across all grinds for this size
        sizeData.totalStock += variant.stock;
      });

      const availableSizes: SizePrice[] = Array.from(sizeMap.entries())
        .map(([size, data]) => ({
          size,
          price: data.price,
          availableGrinds: Array.from(data.grinds).sort(),
          totalStock: data.totalStock,
        }))
        .sort((a, b) => {
          const sizeOrder: Record<string, number> = {
            "250g": 1,
            "500g": 2,
            "1kg": 3,
          };
          return (sizeOrder[a.size] || 999) - (sizeOrder[b.size] || 999);
        });

      return {
        _id: coffee._id,
        slug: coffee.slug,
        name: coffee.name,
        origin: coffee.origin,
        roastLevel: coffee.roastLevel,
        img: coffee.img,
        images: coffee.images,
        notes: coffee.notes,
        story: coffee.story,
        process: coffee.process,
        altitude: coffee.altitude,
        harvest: coffee.harvest,
        cupping_score: coffee.cupping_score,
        variety: coffee.variety,
        brewing: coffee.brewing,
        bestSeller: coffee.bestSeller,
        createdAt: coffee.createdAt,
        updatedAt: coffee.updatedAt,
        variantCount: coffee.variantCount,
        minPrice: coffee.minPrice,
        availableGrinds: coffee.availableGrinds,
        availableSizes,
        totalStock: coffee.totalStock,
        variants: coffee.variants,
      };
    });

    // Get total count for pagination
    const total = await Coffee.countDocuments(
      Object.keys(matchFilter).length > 0 ? matchFilter : {}
    );

    return NextResponse.json(
      {
        success: true,
        data: transformedCoffees,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error fetching coffees:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch coffees",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coffee
 * Create new coffee (authenticated users)
 *
 * PROTECTED: Requires an authenticated user.
 */
export async function POST(request: NextRequest) {
  // require authentication
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();

    const body = await request.json();
    const {
      slug,
      name,
      origin,
      notes,
      story,
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

    // Validate required fields
    if (!slug || !name) {
      return NextResponse.json(
        {
          success: false,
          message: "Slug and name are required",
        },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existing = await Coffee.findOne({
      slug: slug.toLowerCase(),
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee with this slug already exists",
        },
        { status: 409 }
      );
    }

    const coffee = new Coffee({
      slug: slug.toLowerCase(),
      name,
      origin,
      notes,
      story: story ?? null,
      img,
      images,
      roastLevel,
      process,
      altitude,
      harvest,
      cupping_score,
      variety,
      brewing,
      bestSeller: bestSeller || false,
    });

    await coffee.save();

    return NextResponse.json(
      {
        success: true,
        message: "Coffee created successfully",
        data: coffee,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating coffee:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create coffee",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}