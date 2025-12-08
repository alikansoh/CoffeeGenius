import { NextRequest, NextResponse } from "next/server";
import Coffee from "@/models/Coffee";
import CoffeeVariant from "@/models/CoffeeVariant";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";
import { verifyAuthForApi } from "@/lib/auth";
import { v2 as cloudinary } from 'cloudinary';  // ✅ Cloudinary import

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: process. env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process. env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  img: string;  // ✅ Cloudinary public ID
  images?: string[];  // ✅ Array of Cloudinary public IDs (images + videos)
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
 *
 * PROTECTED: Requires an authenticated user. 
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

    const matchFilter: { $or: Array<{ slug?: string; _id?: mongoose.Types.ObjectId }> } = {
      $or: [{ slug: coffeeId.toLowerCase() }],
    };

    if (isValidObjectId) {
      matchFilter.$or.push({ _id: new mongoose.Types.ObjectId(coffeeId) });
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
          images: 1,  // ✅ Include images array in response
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

    if (!coffees. length) {
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
    coffee.variants.forEach((variant: CoffeeVariantData) => {
      const currentPrice = sizeMap.get(variant.size);
      if (currentPrice === undefined || variant.price < currentPrice) {
        sizeMap.set(variant.size, variant.price);
      }
    });

    const availableSizes: SizePrice[] = Array. from(sizeMap.entries())
      .map(([size, price]) => ({ size, price }))
      . sort((a, b) => {
        const sizeOrder: Record<string, number> = {
          "250g": 1,
          "500g": 2,
          "1kg": 3,
        };
        return (sizeOrder[a.size] || 999) - (sizeOrder[b. size] || 999);
      });

    const calculatedMinPrice =
      coffee.variants. length > 0
        ? Math. min(...coffee.variants.map((v: CoffeeVariantData) => v.price))
        : 0;

    const transformedCoffee: CoffeeDetail = {
      ...coffee,
      availableSizes,
      minPrice:
        coffee.minPrice > 0 && coffee. minPrice < 999999
          ? coffee.minPrice
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
        error: error instanceof Error ?   error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/coffee/[id]
 * Update a coffee by ID or slug (previously admin-only; now any authenticated user)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

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
      images,  // ✅ This now contains Cloudinary public IDs (images + videos)
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
      img?: string;  // ✅ Cloudinary public ID
      images?: string[];  // ✅ Array of Cloudinary public IDs
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
    if (origin !== undefined) updateData. origin = origin;
    if (notes !== undefined) updateData.notes = notes;
    if (img !== undefined) updateData.img = img;  // ✅ Update main image (Cloudinary public ID)
    if (images !== undefined) updateData.images = images;  // ✅ Update images array (Cloudinary public IDs)
    if (roastLevel !== undefined) updateData.roastLevel = roastLevel;
    if (process !== undefined) updateData.process = process;
    if (altitude !== undefined) updateData.altitude = altitude;
    if (harvest !== undefined) updateData. harvest = harvest;
    if (cupping_score !== undefined) updateData.cupping_score = cupping_score;
    if (variety !== undefined) updateData.variety = variety;
    if (brewing !== undefined) updateData.brewing = brewing;
    if (bestSeller !== undefined) updateData.bestSeller = bestSeller;

    // Try to find by slug first, then by ID
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

    // Update coffee
    Object. assign(coffee, updateData);
    await coffee.save();

    return NextResponse.json(
      {
        success: true,
        message: "Coffee updated successfully",
        data: coffee,
      },
      { status: 200 }
    );
  } catch (error) {
    console. error("Error updating coffee:", error);
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

/**
 * DELETE /api/coffee/[id]
 * Delete a coffee AND its Cloudinary images/videos
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

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

    // Try to find by slug first, then by ID
    let coffee = await Coffee.findOne({ slug: coffeeId.toLowerCase() });

    if (!coffee && mongoose.Types. ObjectId.isValid(coffeeId)) {
      coffee = await Coffee.findById(coffeeId);
    }

    if (! coffee) {
      return NextResponse.json(
        {
          success: false,
          message: "Coffee not found",
        },
        { status: 404 }
      );
    }

    // ✅ Delete images from Cloudinary
    const cloudinaryDeleteResults = {
      images: 0,
      videos: 0,
      errors: 0,
    };

    // Collect all unique public IDs to delete
    const publicIdsToDelete = new Set<string>();
    
    if (coffee.img) {
      publicIdsToDelete. add(coffee.img);
    }
    
    if (coffee.images && Array.isArray(coffee.images)) {
      coffee.images.forEach((publicId: string) => {
        if (publicId) publicIdsToDelete.add(publicId);
      });
    }

    // Delete from Cloudinary
    if (publicIdsToDelete.size > 0) {
      const deletePromises = Array.from(publicIdsToDelete).map(async (publicId) => {
        try {
          // Determine if it's a video or image
          const isVideo = publicId.includes('/video/') || 
                         publicId.includes('. mp4') || 
                         publicId.includes('.mov') || 
                         publicId.includes('.webm') ||
                         publicId.toLowerCase().includes('video');
          
          const resourceType = isVideo ? 'video' : 'image';
          
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
          
          if (isVideo) {
            cloudinaryDeleteResults.videos++;
          } else {
            cloudinaryDeleteResults.images++;
          }
        } catch (error) {
          console.error(`Failed to delete ${publicId} from Cloudinary:`, error);
          cloudinaryDeleteResults.errors++;
        }
      });

      await Promise.all(deletePromises);
    }

    // Delete all variants associated with this coffee
    const deletedVariants = await CoffeeVariant.deleteMany({
      coffeeId: coffee._id,
    });

    // Delete the coffee from database
    await Coffee.findByIdAndDelete(coffee._id);

    return NextResponse.json(
      {
        success: true,
        message: "Coffee deleted successfully",
        data: {
          coffeeId: coffee._id,
          coffeeName: coffee.name,
          variantsDeleted: deletedVariants.deletedCount,
          cloudinaryDeleted: {
            images: cloudinaryDeleteResults.images,
            videos: cloudinaryDeleteResults.videos,
            errors: cloudinaryDeleteResults.errors,
            total: cloudinaryDeleteResults.images + cloudinaryDeleteResults.videos,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting coffee:", error);
    return NextResponse. json(
      {
        success: false,
        message: "Failed to delete coffee",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}