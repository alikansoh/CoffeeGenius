import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICoffeeVariant extends Document {
  coffeeId: Types.ObjectId;
  sku: string;
  size: "250g" | "1kg";
  grind: "whole-bean" | "espresso" | "filter" | "cafetiere" | "aeropress";
  price: number;
  stock: number;
  img?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CoffeeVariantSchema = new Schema<ICoffeeVariant>(
  {
    coffeeId: {
      type: Schema.Types.ObjectId,
      ref: "Coffee",
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    size: {
      type: String,
      enum: ["250g", "1kg"],
      required: true,
    },
    grind: {
      type: String,
      enum: ["whole-bean", "espresso", "filter", "cafetiere", "aeropress"],
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    img: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: ensure one variant per size+grind per coffee
CoffeeVariantSchema.index({ coffeeId: 1, size: 1, grind: 1 }, { unique: true });

// Index for fast SKU lookup
CoffeeVariantSchema. index({ sku: 1 });

// Prevent model recompilation in Next.js dev mode
export default mongoose.models.CoffeeVariant ||
  mongoose.model<ICoffeeVariant>("CoffeeVariant", CoffeeVariantSchema);