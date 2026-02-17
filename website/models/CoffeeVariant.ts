import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICoffeeVariant extends Document {
  coffeeId: Types.ObjectId;
  sku: string;
  size: string;
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
      uppercase: true,
      trim: true,
    },
    size: {
      type: String,
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

// Compound index: one variant per size+grind per coffee
CoffeeVariantSchema.index({ coffeeId: 1, size: 1, grind: 1 }, { unique: true });

export default mongoose.models.CoffeeVariant ||
  mongoose.model<ICoffeeVariant>("CoffeeVariant", CoffeeVariantSchema);