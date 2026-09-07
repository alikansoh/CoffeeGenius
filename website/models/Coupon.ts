import mongoose, { Schema, Document, Model } from "mongoose";

export type CouponType =
  | "NTH_ITEM"
  | "SPEND_THRESHOLD"
  | "BUY_X_GET_Y_FREE"
  | "PERCENT_OFF_PRODUCT"
  | "SUBSCRIPTION_INTRO";

export interface CouponUsageRecord {
  email: string;
  orderId?: string;
  usedAt?: Date;
}

export interface ICoupon extends Document {
  code?: string;
  name: string;
  description?: string;
  type: CouponType;
  isActive: boolean;
  isAutomatic: boolean;

  nthItem?: {
    nth: number;
    percentOff: number;
  };
  spendThreshold?: {
    threshold: number;
    percentOff: number;
  };
  buyXGetY?: {
    x: number;
    y: number;
    /** Coffee id, or "variant:<variantId>" to target one specific size/grind */
    productIds?: string[];
  };
  productDiscount?: {
    /** Coffee id, or "variant:<variantId>" to target one specific size/grind */
    productIds: string[];
    percentOff: number;
  };
  /**
   * Applies automatically to a new subscription on the scoped coffee/variant
   * (see appliesTo/productIds below), replacing the variant's normal
   * subscribe-and-save price for the customer's first N delivery cycles,
   * then reverting to the normal price. No code — never entered at checkout.
   */
  subscriptionIntro?: {
    /** How many delivery cycles get the intro price (1–4) */
    cycles: number;
    percentOff: number;
  };

  minimumOrderAmount?: number;
  usageLimit?: number;
  maxUsagePerUser?: number;
  usageCount: number;
  usageRecords: CouponUsageRecord[];
  startsAt?: Date;
  expiresAt?: Date;

  appliesTo: "all" | "coffee" | "equipment" | "specific_products";
  /** Coffee id, or "variant:<variantId>" to target one specific size/grind */
  productIds?: string[];

  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: [
        "NTH_ITEM",
        "SPEND_THRESHOLD",
        "BUY_X_GET_Y_FREE",
        "PERCENT_OFF_PRODUCT",
        "SUBSCRIPTION_INTRO",
      ],
      required: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    isAutomatic: { type: Boolean, default: false, index: true },

    nthItem: {
      nth: { type: Number, min: 1 },
      percentOff: { type: Number, min: 0, max: 100 },
    },
    spendThreshold: {
      threshold: { type: Number, min: 0 },
      percentOff: { type: Number, min: 0, max: 100 },
    },
    buyXGetY: {
      x: { type: Number, min: 1 },
      y: { type: Number, min: 1 },
      productIds: [{ type: String }],
    },
    productDiscount: {
      productIds: [{ type: String }],
      percentOff: { type: Number, min: 0, max: 100 },
    },
    subscriptionIntro: {
      cycles: { type: Number, min: 1, max: 4 },
      percentOff: { type: Number, min: 0, max: 100 },
    },

    minimumOrderAmount: { type: Number, min: 0 },
    usageLimit: { type: Number, min: 1 },
    maxUsagePerUser: { type: Number, min: 1 },
    usageCount: { type: Number, default: 0 },
    usageRecords: [
      {
        email: { type: String, required: true, lowercase: true, trim: true },
        orderId: { type: String },
        usedAt: { type: Date, default: Date.now },
      },
    ],

    startsAt: { type: Date },
    expiresAt: { type: Date },

    appliesTo: {
      type: String,
      enum: ["all", "coffee", "equipment", "specific_products"],
      default: "all",
    },
    productIds: [{ type: String }],

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const Coupon: Model<ICoupon> =
  (mongoose.models.Coupon as Model<ICoupon>) ||
  mongoose.model<ICoupon>("Coupon", CouponSchema);

export default Coupon;