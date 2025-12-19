import mongoose, { Document, Model, Schema, Types, ToObjectOptions } from "mongoose";

/**
 * Equipment model storing canonical decimal `price` (pounds) and legacy `pricePence` (integer pence).
 */
export interface IEquipment extends Document {
  slug?: string;
  name?: string;
  brand?: string;
  category?: string;
  features?: string[];
  // canonical stored price as decimal pounds
  price?: number;
  // legacy / integer storage in pence (kept for compatibility)
  pricePence?: number;
  currency?: string;
  img?: string;
  images?: string[];
  stock?: number;
  totalStock?: number;
  notes?: string;
  description?: string;
  specs?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ALLOWED_CATEGORIES = [
  "Espresso Machines",
  "Coffee Grinders",
  "Coffee Brewers",
  "Barista Accessories",
  "Serving & Storage",
] as const;

const EquipmentSchema = new Schema(
  {
    slug: { type: String, index: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    brand: { type: String },
    category: {
      type: String,
      enum: ALLOWED_CATEGORIES as unknown as string[],
      index: true,
    },
    features: { type: [String], default: [] },
    // canonical decimal price in pounds
    price: { type: Number, default: 0 },
    // integer pence retained for compatibility
    pricePence: { type: Number, default: 0 },
    currency: { type: String, default: "GBP" },
    img: { type: String },
    images: { type: [String], default: [] },
    stock: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    notes: { type: String },
    description: { type: String },
    specs: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Pre-save hook to keep price (pounds) and pricePence (pence) in sync.
 */
EquipmentSchema.pre("save", function (this: Document & IEquipment) {
  if (typeof this.price === "number" && Number.isFinite(this.price)) {
    // normalize and derive pence
    this.price = Number(this.price.toFixed(2));
    this.pricePence = Math.round(this.price * 100);
  } else if (typeof this.pricePence === "number" && Number.isFinite(this.pricePence)) {
    // derive decimal pounds from pence
    this.price = Number((this.pricePence / 100).toFixed(2));
  } else {
    // ensure sensible defaults
    if (this.pricePence === undefined || this.pricePence === null) this.pricePence = 0;
    if (this.price === undefined || this.price === null) {
      this.price = Number((this.pricePence / 100).toFixed(2));
    } else if (typeof this.price === "number" && Number.isFinite(this.price)) {
      this.price = Number(this.price.toFixed(2));
      this.pricePence = Math.round(this.price * 100);
    }
  }
});

/**
 * Transform function for toJSON/toObject
 * Uses a type-safe approach without `any` in the implementation
 */
function transformDoc(
  _doc: unknown,
  ret: unknown,
  _options?: unknown
): unknown {
  // Cast to a mutable record for safe assignment/manipulation
  const out = ret as Record<string, unknown>;

  // convert _id -> id
  if (out._id !== undefined) {
    try {
      out.id = String(out._id);
    } catch {
      // ignore conversion errors
    }
  }

  // remove mongoose internals
  delete out._id;
  delete out.__v;

  // Normalize pricePence (accept number or numeric string)
  const rawPence = out.pricePence;
  if (rawPence === undefined || rawPence === null) {
    out.pricePence = 0;
  } else if (typeof rawPence === "number" && Number.isFinite(rawPence)) {
    out.pricePence = Math.round(rawPence);
  } else {
    const parsed = Number(String(rawPence));
    out.pricePence = Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  // Normalize price (decimal pounds): accept number or numeric string; otherwise derive from pence.
  const rawPrice = out.price;
  if (rawPrice === undefined || rawPrice === null) {
    out.price = Number(((out.pricePence as number) / 100).toFixed(2));
  } else if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) {
    const rounded = Number(rawPrice.toFixed(2));
    out.price = rounded;
    out.pricePence = Math.round(rounded * 100);
  } else {
    const parsed = Number(String(rawPrice));
    if (Number.isFinite(parsed)) {
      const rounded = Number(parsed.toFixed(2));
      out.price = rounded;
      out.pricePence = Math.round(rounded * 100);
    } else {
      out.price = Number(((out.pricePence as number) / 100).toFixed(2));
    }
  }

  return ret;
}

/**
 * Assign transform implementations to toJSON / toObject.
 * Use a targeted type assertion to satisfy Mongoose's strict transform typing.
 */
EquipmentSchema.set("toJSON", {
  virtuals: true,
  transform: transformDoc as (doc: Document, ret: Record<string, unknown>) => unknown,
});

EquipmentSchema.set("toObject", {
  virtuals: true,
  transform: transformDoc as (doc: Document, ret: Record<string, unknown>) => unknown,
});

const Equipment: Model<IEquipment> =
  mongoose.models.Equipment || mongoose.model<IEquipment>("Equipment", EquipmentSchema);

export default Equipment;