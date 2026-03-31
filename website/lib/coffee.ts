import dbConnect from "./dbConnect";
import mongoose from "mongoose";

export interface ApiSizePrice {
  size: string;
  price: number;
  availableGrinds?: string[];
  totalStock?: number;
}

export interface ApiVariant {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  roastType: "espresso" | "filter" | "omni";
  price: number;
  stock: number;
  img: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCoffee {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  description?: string;
  notes?: string;
  img: string | string[];
  images?: string[];
  roastLevel?: "light" | "medium" | "dark";
  roastType?: "espresso" | "filter" | "omni";
  /** Derived from variants — all unique roast types across this coffee's variants */
  roastTypes?: ("espresso" | "filter" | "omni")[];
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt?: string;
  updatedAt?: string;
  variantCount?: number;
  minPrice?: number;
  availableGrinds?: string[];
  availableSizes?: ApiSizePrice[];
  totalStock?: number;
  variants?: ApiVariant[];
  inStock?: boolean;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  story?: string;
  sku?: string;
  brand?: string;
  currency?: string;
  aggregateRating?: { ratingValue: number; reviewCount: number };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  origin: string;
  notes: string;
  price: number;
  prices: Record<string, number>;
  img: string;
  roastLevel: "light" | "medium" | "dark";
  roastType?: "espresso" | "filter" | "omni";
  /** All unique roast types across this coffee's variants */
  roastTypes: ("espresso" | "filter" | "omni")[];
  grinds: string[];
  availableSizes: ApiSizePrice[];
  minPrice: number;
  variants: ApiVariant[];
  bestSeller?: boolean;
}

const CoffeeSchema = new mongoose.Schema(
  {
    slug: String,
    name: String,
    origin: String,
    description: String,
    notes: String,
    img: mongoose.Schema.Types.Mixed,
    images: [String],
    roastLevel: { type: String, enum: ["light", "medium", "dark"] },
    roastType: {
      type: String,
      enum: ["espresso", "filter", "omni"],
    },
    process: String,
    altitude: String,
    harvest: String,
    cupping_score: Number,
    variety: String,
    brewing: String,
    bestSeller: Boolean,
    variantCount: Number,
    minPrice: Number,
    availableGrinds: [String],
    availableSizes: [mongoose.Schema.Types.Mixed],
    totalStock: Number,
    variants: [mongoose.Schema.Types.Mixed],
    inStock: Boolean,
    stockStatus: String,
    story: String,
    sku: String,
    brand: String,
    currency: String,
    aggregateRating: mongoose.Schema.Types.Mixed,
    createdAt: Date,
    updatedAt: Date,
  },
  {
    collection: "coffees",
    timestamps: true,
    strict: false,
  }
);

const Coffee =
  mongoose.models.Coffee || mongoose.model("Coffee", CoffeeSchema);

export async function getCoffees(searchQuery?: string): Promise<ApiCoffee[]> {
  try {
    await dbConnect();

    const filter = searchQuery
      ? {
          $or: [
            { name: { $regex: searchQuery, $options: "i" } },
            { slug: { $regex: searchQuery, $options: "i" } },
            { origin: { $regex: searchQuery, $options: "i" } },
            { notes: { $regex: searchQuery, $options: "i" } },
          ],
        }
      : {};

    const rawCoffees = await Coffee.find(filter)
      .sort({ bestSeller: -1, createdAt: -1 })
      .lean()
      .exec();

    console.log(`✅ Found ${rawCoffees.length} coffee items`);
    return rawCoffees as ApiCoffee[];
  } catch (error) {
    console.error("❌ Error fetching coffees:", error);
    return [];
  }
}

export async function getCoffeeBySlug(
  slug: string
): Promise<ApiCoffee | null> {
  try {
    await dbConnect();

    const rawCoffee = await Coffee.findOne({ slug }).lean().exec();

    if (!rawCoffee) {
      console.log(`❌ Coffee not found: ${slug}`);
      return null;
    }

    console.log(`✅ Found coffee: ${(rawCoffee as ApiCoffee).name}`);
    return rawCoffee as ApiCoffee;
  } catch (error) {
    console.error("❌ Error fetching coffee by slug:", error);
    return null;
  }
}

export async function getCoffeeById(id: string): Promise<ApiCoffee | null> {
  try {
    await dbConnect();

    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    const matchFilter: { $or: object[] } = {
      $or: [{ slug: id.toLowerCase() }],
    };

    if (isValidObjectId) {
      matchFilter.$or.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    const results = await Coffee.aggregate([
      { $match: matchFilter },
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
              else: { $ifNull: ["$minPrice", 0] },
            },
          },
          totalStock: {
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              { $sum: "$variants.stock" },
              { $ifNull: ["$totalStock", 0] },
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
              { $ifNull: ["$availableGrinds", []] },
            ],
          },
          // Collect all unique roast types from variants
          roastTypes: {
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              {
                $reduce: {
                  input: "$variants",
                  initialValue: [],
                  in: {
                    $cond: [
                      { $in: ["$$this.roastType", "$$value"] },
                      "$$value",
                      { $concatArrays: ["$$value", ["$$this.roastType"]] },
                    ],
                  },
                },
              },
              { $ifNull: ["$roastTypes", []] },
            ],
          },
          // Derive a single roastType:
          // - If no variants → use stored roastType on coffee doc (or null)
          // - If 1 unique roast type across all variants → use that value
          // - If multiple unique roast types → "omni"
          roastType: {
            $let: {
              vars: {
                allTypes: {
                  $reduce: {
                    input: "$variants",
                    initialValue: [],
                    in: {
                      $cond: [
                        { $in: ["$$this.roastType", "$$value"] },
                        "$$value",
                        {
                          $concatArrays: ["$$value", ["$$this.roastType"]],
                        },
                      ],
                    },
                  },
                },
              },
              in: {
                $cond: [
                  // No variants or empty — fall back to stored value
                  { $eq: [{ $size: "$$allTypes" }, 0] },
                  { $ifNull: ["$roastType", null] },
                  {
                    $cond: [
                      // Exactly one unique roast type — use it
                      { $eq: [{ $size: "$$allTypes" }, 1] },
                      { $arrayElemAt: ["$$allTypes", 0] },
                      // Multiple different roast types — coffee is omni
                      "omni",
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      { $limit: 1 },
    ]);

    if (!results.length) {
      console.log(`❌ Coffee not found: ${id}`);
      return null;
    }

    const coffee = results[0] as ApiCoffee & {
      variants: ApiVariant[];
    };

    const sizeMap = new Map<
      string,
      { price: number; grinds: string[]; stock: number }
    >();

    (coffee.variants ?? []).forEach((v) => {
      const existing = sizeMap.get(v.size);
      if (!existing) {
        sizeMap.set(v.size, {
          price: v.price,
          grinds: [v.grind],
          stock: v.stock,
        });
      } else {
        if (v.price < existing.price) existing.price = v.price;
        if (!existing.grinds.includes(v.grind)) existing.grinds.push(v.grind);
        existing.stock += v.stock;
      }
    });

    const availableSizes: ApiSizePrice[] = Array.from(sizeMap.entries()).map(
      ([size, data]) => ({
        size,
        price: data.price,
        availableGrinds: data.grinds,
        totalStock: data.stock,
      })
    );

    console.log(
      `✅ Found coffee: ${coffee.name} (${coffee.variants?.length ?? 0} variants)`
    );

    return { ...coffee, availableSizes } as ApiCoffee;
  } catch (error) {
    console.error("❌ Error fetching coffee by id:", error);
    return null;
  }
}

export function mapApiCoffeesToProducts(apiCoffees: ApiCoffee[]): Product[] {
  return apiCoffees.map((coffee) => {
    const prices: Record<string, number> = {};
    if (coffee.availableSizes && coffee.availableSizes.length > 0) {
      coffee.availableSizes.forEach((s) => {
        prices[s.size] = s.price;
      });
    } else {
      prices["250g"] = coffee.minPrice ?? 0;
    }

    const imgUrl = Array.isArray(coffee.img)
      ? coffee.img[0] || ""
      : coffee.img || "";

    // Derive roastTypes from variants if not already aggregated
    const roastTypes: ("espresso" | "filter" | "omni")[] =
      coffee.roastTypes ??
      [
        ...new Set(
          (coffee.variants ?? [])
            .map((v) => v.roastType)
            .filter(
              (rt): rt is "espresso" | "filter" | "omni" => !!rt
            )
        ),
      ];

    // Derive single roastType:
    // - 0 types  → undefined
    // - 1 type   → that type
    // - 2+ types → "omni"
    const roastType: "espresso" | "filter" | "omni" | undefined =
      coffee.roastType ??
      (roastTypes.length === 1
        ? roastTypes[0]
        : roastTypes.length > 1
        ? "omni"
        : undefined);

    return {
      id: coffee._id || coffee.slug,
      name: coffee.name,
      slug: coffee.slug,
      origin: coffee.origin,
      notes: coffee.notes ?? "",
      price: coffee.minPrice ?? 0,
      prices,
      img: imgUrl,
      roastLevel: coffee.roastLevel ?? "medium",
      roastType,
      roastTypes,
      grinds: coffee.availableGrinds ?? [],
      availableSizes: coffee.availableSizes ?? [],
      minPrice: coffee.minPrice ?? 0,
      variants: coffee.variants ?? [],
      bestSeller: coffee.bestSeller,
    } as Product;
  });
}