import Equipment from "@/models/Equipment"; // Import your existing model
import type { IEquipment } from "@/models/Equipment";
import dbConnect from "./dbConnect";

// ==================== Type Definitions ====================

export interface ApiEquipment {
  _id?: string;
  id?: string;
  slug?: string;
  name?: string;
  brand?: string;
  category?: string;
  features?: string[];
  notes?: string;
  description?: string;
  specs?: Record<string, unknown>;
  
  // Price fields
  price?: number;
  pricePence?: number;
  pricePenceMin?: number;
  minPrice?: number;
  minPricePence?: number;
  
  // Image fields
  img?: string;
  imgPublicId?: string;
  imgUrl?: string;
  images?: string[];
  imagesPublicIds?: string[];
  imagesUrls?: string[];
  
  // Stock
  totalStock?: number;
  stock?: number;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentProduct {
  id: string;
  slug?: string;
  name: string;
  brand?: string;
  category?: string;
  features?: string[];
  price?: number;
  img?: string;
  stock?: number;
  notes?: string;
  description?: string;
}

// ==================== Database Functions ====================

/**
 * Get all equipment with optional limit
 */
export async function getEquipment(limit = 200): Promise<ApiEquipment[]> {
  try {
    await dbConnect();
    
    const rawEquipment = await Equipment
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    console.log(`✅ Found ${rawEquipment.length} equipment items`); // Debug log
    return rawEquipment as unknown as ApiEquipment[];
  } catch (error) {
    console.error("❌ Error fetching equipment:", error);
    return [];
  }
}

/**
 * Get equipment by slug or ID
 */
export async function getEquipmentById(id: string): Promise<ApiEquipment | null> {
  try {
    await dbConnect();
    
    console.log(`🔍 Looking for equipment with id/slug: ${id}`); // Debug log
    
    // Try to find by _id first
    let rawEquipment = await Equipment
      .findById(id)
      .lean()
      .exec();

    // If not found by _id, try by slug
    if (!rawEquipment) {
      rawEquipment = await Equipment
        .findOne({ slug: id })
        .lean()
        .exec();
    }

    if (!rawEquipment) {
      console.log(`❌ Equipment not found: ${id}`);
      return null;
    }

    console.log(`✅ Found equipment: ${rawEquipment.name}`);
    return rawEquipment as unknown as ApiEquipment;
  } catch (error) {
    // If findById fails (invalid ObjectId format), try slug
    try {
      await dbConnect();
      const rawEquipment = await Equipment
        .findOne({ slug: id })
        .lean()
        .exec();
      
      if (rawEquipment) {
        console.log(`✅ Found equipment by slug: ${rawEquipment.name}`);
      }
      
      return rawEquipment ? (rawEquipment as unknown as ApiEquipment) : null;
    } catch (err) {
      console.error("❌ Error fetching equipment by id:", error);
      return null;
    }
  }
}

/**
 * Get equipment by category
 */
export async function getEquipmentByCategory(category: string, limit = 100): Promise<ApiEquipment[]> {
  try {
    await dbConnect();
    
    const rawEquipment = await Equipment
      .find({ category: { $regex: category, $options: 'i' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    console.log(`✅ Found ${rawEquipment.length} equipment in category: ${category}`);
    return rawEquipment as unknown as ApiEquipment[];
  } catch (error) {
    console.error("❌ Error fetching equipment by category:", error);
    return [];
  }
}

/**
 * Search equipment
 */
export async function searchEquipment(query: string, limit = 100): Promise<ApiEquipment[]> {
  try {
    await dbConnect();
    
    const rawEquipment = await Equipment
      .find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { brand: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
        ]
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    console.log(`✅ Found ${rawEquipment.length} equipment matching: ${query}`);
    return rawEquipment as unknown as ApiEquipment[];
  } catch (error) {
    console.error("❌ Error searching equipment:", error);
    return [];
  }
}

// ==================== Mapping Functions ====================

/**
 * Convert API equipment to EquipmentProduct format
 */
export function mapApiEquipmentToProducts(raw: ApiEquipment[]): EquipmentProduct[] {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

  return raw.map((r) => {
    // Resolve image url: prefer imgUrl, then imgPublicId/img
    let imgUrl: string | undefined = undefined;
    if (typeof r.imgUrl === "string" && r.imgUrl.trim()) {
      imgUrl = r.imgUrl;
    } else if (r.imagesUrls && r.imagesUrls.length > 0) {
      imgUrl = r.imagesUrls[0];
    } else {
      const pid = (typeof r.imgPublicId === "string" && r.imgPublicId.trim()) 
        ? r.imgPublicId 
        : (r.imagesPublicIds && r.imagesPublicIds.length > 0)
        ? r.imagesPublicIds[0]
        : (typeof r.img === "string" && r.img.trim() ? r.img : undefined);
      
      if (pid) {
        if (pid.startsWith("http://") || pid.startsWith("https://")) {
          imgUrl = pid;
        } else if (cloudName) {
          imgUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${pid}`;
        }
      }
    }

    // Price resolution (pounds)
    let price = undefined as number | undefined;
    if (typeof r.price === "number" && Number.isFinite(r.price)) {
      price = Number(r.price);
    } else if (typeof r.minPrice === "number" && Number.isFinite(r.minPrice)) {
      price = Number(r.minPrice);
    } else if (typeof r.pricePence === "number" && Number.isFinite(r.pricePence)) {
      price = Number(r.pricePence / 100);
    } else if (typeof r.minPricePence === "number" && Number.isFinite(r.minPricePence)) {
      price = Number(r.minPricePence / 100);
    } else if (typeof r.pricePenceMin === "number" && Number.isFinite(r.pricePenceMin)) {
      price = Number(r.pricePenceMin / 100);
    }

    const idVal = (r._id ?? r.id ?? r.slug ?? "").toString() || Math.random().toString(36).slice(2, 9);

    return {
      id: String(idVal),
      slug: typeof r.slug === "string" ? r.slug : undefined,
      name: typeof r.name === "string" && r.name.trim() ? r.name : "Untitled product",
      brand: typeof r.brand === "string" ? r.brand : undefined,
      category: typeof r.category === "string" ? r.category : undefined,
      features: Array.isArray(r.features) ? r.features.filter((f): f is string => typeof f === "string") : undefined,
      price: price === undefined ? undefined : Number(price.toFixed(2)),
      img: imgUrl,
      stock: typeof r.totalStock === "number" ? r.totalStock : (typeof r.stock === "number" ? r.stock : undefined),
      notes: typeof r.notes === "string" ? r.notes : undefined,
      description: typeof r.description === "string" ? r.description : undefined,
    } as EquipmentProduct;
  });
}