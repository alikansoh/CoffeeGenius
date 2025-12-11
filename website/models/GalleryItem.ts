"use server";

import mongoose, { Document, Model, Schema } from "mongoose";

export interface IGalleryItem extends Document {
  publicId: string;        // Cloudinary public_id
  url: string;             // secure_url from Cloudinary
  format?: string;
  resourceType?: string;   // "image" | "video" | "raw" etc.
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  duration?: number | null; // for videos
  title?: string;
  description?: string;
  alt?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const GalleryItemSchema = new Schema<IGalleryItem>(
  {
    publicId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    format: { type: String },
    resourceType: { type: String },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    bytes: { type: Number, default: null },
    duration: { type: Number, default: null },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// index to help queries for active items sorted by newest
GalleryItemSchema.index({ active: 1, createdAt: -1 });

const GalleryItem: Model<IGalleryItem> =
  (mongoose.models?.GalleryItem as Model<IGalleryItem>) ||
  mongoose.model<IGalleryItem>("GalleryItem", GalleryItemSchema);

export default GalleryItem;