"use server";

import mongoose, { Document, Model, Schema } from "mongoose";

export interface IOffer extends Document {
  text: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const OfferSchema = new Schema<IOffer>(
  {
    text: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Add an index to make queries for active offers + recent sorting fast
OfferSchema.index({ active: 1, createdAt: -1 });

// Prevent model overwrite issues in dev / with HMR
const Offer: Model<IOffer> =
  (mongoose.models?.Offer as Model<IOffer>) || mongoose.model<IOffer>("Offer", OfferSchema);

export default Offer;