import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPost extends Document {
  title: string;
  slug?: string;
  url?: string;
  date?: Date;
  excerpt?: string;
  content?: string;
  // Cloudinary fields
  imagePublicId?: string;        // store public_id from Cloudinary
  imageFormat?: string;          // e.g. "jpg", "png", "mp4" (optional but useful)
  imageResourceType?: string;    // e.g. "image" or "video"
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const PostSchema = new Schema<IPost>(
  {
    title: { type: String, required: true },
    slug: { type: String, index: true },
    url: { type: String },
    date: { type: Date },
    excerpt: { type: String },
    content: { type: String },
    imagePublicId: { type: String },
    imageFormat: { type: String },
    imageResourceType: { type: String },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Post: Model<IPost> =
  (mongoose.models?.Post as Model<IPost>) || mongoose.model<IPost>("Post", PostSchema);
export default Post;