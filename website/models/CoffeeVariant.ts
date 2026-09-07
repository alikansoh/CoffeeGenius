import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICoffeeVariant extends Document {
  coffeeId: Types.ObjectId;
  sku: string;
  size: string;
  grind: "whole-bean" | "espresso" | "filter" | "cafetiere" | "aeropress";
  roastType: "espresso" | "filter" | "omni" | "decaf";
  price: number;
  stock: number;
  img?: string;
  /** Subscribe & save settings */
  subscriptionEnabled?: boolean;
  /** Percent off the normal price for subscribers, e.g. 15 = 15% off */
  subscriptionDiscountPercent?: number;
  /** One Stripe recurring Price per delivery frequency (e.g. every 2/4/6 weeks), created lazily on enable */
  subscriptionFrequencyPrices?: { frequencyWeeks: number; stripePriceId: string }[];
  /** Stripe Product id all of this variant's subscription prices belong to */
  stripeProductId?: string;
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
    roastType: {
      type: String,
      enum: ["espresso", "filter", "omni", "decaf"],
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
    subscriptionEnabled: {
      type: Boolean,
      default: false,
    },
    subscriptionDiscountPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    subscriptionFrequencyPrices: {
      type: [
        {
          frequencyWeeks: { type: Number, required: true },
          stripePriceId: { type: String, required: true },
        },
      ],
      default: undefined,
      _id: false,
    },
    stripeProductId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one variant per size+grind per coffee
// Updated — unique per size+grind+roastType per coffee
CoffeeVariantSchema.index(
  { coffeeId: 1, size: 1, grind: 1, roastType: 1 },
  { unique: true }
);
export default mongoose.models.CoffeeVariant ||
  mongoose.model<ICoffeeVariant>("CoffeeVariant", CoffeeVariantSchema);
