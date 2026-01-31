

import mongoose, { Schema, Document } from "mongoose";

export interface ICoffee extends Document {
  slug: string;
  name: string;
  origin?: string;
  notes?: string;
  story?: string; // ✅ Added story field
  img?: string;
  images?: string[];
  roastLevel?: "light" | "medium" | "dark";
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;  // ✅ Added best seller flag
  createdAt: Date;
  updatedAt: Date;
}

const CoffeeSchema = new Schema<ICoffee>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    origin: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    story: {
      type: String,
      // store longer narrative/description (markdown or HTML as needed)
      default: null,
    },
    img: {
      type: String,
    },
    images: [
      {
        type: String,
      },
    ],
    roastLevel: {
      type: String,
      enum: ["light", "medium", "dark"],
      default: null,
    },
    process: {
      type: String,
      trim: true,
    },
    altitude: {
      type: String,
      trim: true,
    },
    harvest: {
      type: String,
      trim: true,
    },
    cupping_score: {
      type: Number,
      min: 0,
      max: 100,
    },
    variety: {
      type: String,
      trim: true,
    },
    brewing: {
      type: String,
    },
    bestSeller: {  // ✅ Best seller field
      type: Boolean,
      default: false,
      index: true,  // ✅ Index for fast querying
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search (include story so it's searchable)
CoffeeSchema.index({ name: "text", origin: "text", notes: "text", story: "text" });

// Compound index for filtering best sellers with other criteria
CoffeeSchema.index({ bestSeller: 1, createdAt: -1 });

// Prevent model recompilation in Next.js dev mode
export default mongoose.models.Coffee ||
  mongoose.model<ICoffee>("Coffee", CoffeeSchema);