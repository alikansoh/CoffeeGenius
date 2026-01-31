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
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt?: string;
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
  grinds: string[];
  availableSizes: ApiSizePrice[];
  minPrice: number;
  variants: ApiVariant[];
  bestSeller?: boolean;
}

const CoffeeSchema = new mongoose.Schema({
  slug: String,
  name: String,
  origin: String,
  description: String,
  notes: String,
  img: mongoose.Schema.Types.Mixed, // Can be string or array
  images: [String],
  roastLevel: { type: String, enum: ['light', 'medium', 'dark'] },
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
}, { collection: 'Coffee' }); // Change to your collection name

const Coffee = mongoose.models.Coffee || mongoose.model('Coffee', CoffeeSchema);

export async function getCoffees(searchQuery?: string): Promise<ApiCoffee[]> {
  try {
    await dbConnect();
    
    const filter = searchQuery 
      ? { 
          $or: [
            { name: { $regex: searchQuery, $options: 'i' } },
            { slug: { $regex: searchQuery, $options: 'i' } },
            { origin: { $regex: searchQuery, $options: 'i' } },
            { notes: { $regex: searchQuery, $options: 'i' } },
          ]
        }
      : {};
    
    const rawCoffees = await Coffee
      .find(filter)
      .sort({ bestSeller: -1, createdAt: -1 })
      .lean()
      .exec();

    return rawCoffees as ApiCoffee[];
  } catch (error) {
    console.error("Error fetching coffees:", error);
    return [];
  }
}

export async function getCoffeeBySlug(slug: string): Promise<ApiCoffee | null> {
  try {
    await dbConnect();
    
    const rawCoffee = await Coffee
      .findOne({ slug })
      .lean()
      .exec();

    if (!rawCoffee) return null;

    return rawCoffee as ApiCoffee;
  } catch (error) {
    console.error("Error fetching coffee by slug:", error);
    return null;
  }
}

export async function getCoffeeById(id: string): Promise<ApiCoffee | null> {
  try {
    await dbConnect();
    
    // Try to find by _id first
    let rawCoffee = await Coffee
      .findById(id)
      .lean()
      .exec();

    // If not found by _id, try by slug
    if (!rawCoffee) {
      rawCoffee = await Coffee
        .findOne({ slug: id })
        .lean()
        .exec();
    }

    if (!rawCoffee) return null;

    return rawCoffee as ApiCoffee;
  } catch (error) {
    // If findById fails (invalid ObjectId format), try slug
    try {
      const rawCoffee = await Coffee
        .findOne({ slug: id })
        .lean()
        .exec();
      
      return rawCoffee ? (rawCoffee as ApiCoffee) : null;
    } catch (err) {
      console.error("Error fetching coffee by id:", error);
      return null;
    }
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

    return {
      id: coffee._id || coffee.slug,
      name: coffee.name,
      slug: coffee.slug,
      origin: coffee.origin,
      notes: coffee.notes ?? "",
      price: coffee.minPrice ?? 0,
      prices,
      img: Array.isArray(coffee.img) ? coffee.img[0] : coffee.img,
      roastLevel: coffee.roastLevel ?? "medium",
      grinds: coffee.availableGrinds ?? [],
      availableSizes: coffee.availableSizes ?? [],
      minPrice: coffee.minPrice ?? 0,
      variants: coffee.variants ?? [],
      bestSeller: coffee.bestSeller,
    } as Product;
  });
}