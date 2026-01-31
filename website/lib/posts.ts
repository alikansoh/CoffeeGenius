import dbConnect from "./dbConnect";
import mongoose from "mongoose";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  image?: string;
  tags?: string[];
  content?: string;
  author?: string;
  updatedAt?: string;
};

type RawPost = {
  _id?: unknown;
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  content?: unknown;
  date?: unknown;
  imagePublicId?: unknown;
  imageFormat?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  author?: unknown;
  authorName?: unknown;
  publishedAt?: unknown;
};

const PostSchema = new mongoose.Schema({
  title: String,
  slug: String,
  description: String,
  content: String,
  date: Date,
  imagePublicId: String,
  imageFormat: String,
  tags: [String],
  author: String,
  authorName: String,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'Post' }); // Change to 'Post' or 'posts' based on your collection

const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => toString(x)).filter(Boolean);
  return [];
}

function getCloudinaryUrl(publicId?: string, format?: string) {
  if (!publicId || !format) return undefined;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "drjpzgjn7";
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_1200,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
}

export async function getPosts(limit = 50): Promise<BlogPost[]> {
  try {
    await dbConnect();
    
    const rawPosts = await Post
      .find({})
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return rawPosts.map((post: RawPost, idx: number) => {
      const rec = isObject(post) ? post : ({} as Record<string, unknown>);
      const id = toString(rec._id ?? rec.id ?? `anon-${idx}`);
      const title = toString(rec.title ?? "Untitled post");
      const slug = toString(rec.slug ?? id);
      const description = toString(rec.description ?? rec.content ?? "");
      const content = toString(rec.content ?? "");
      const date = toString(rec.date ?? rec.publishedAt ?? rec.updatedAt ?? rec.createdAt ?? new Date().toISOString());
      const image = getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat)) ?? undefined;
      const tags = toStringArray(rec.tags);
      const author = toString(rec.author ?? rec.authorName ?? "Coffee Genius");
      const updatedAt = toString(rec.updatedAt ?? "");
      return { id, title, slug, description, content, date, image, tags, author, updatedAt } as BlogPost;
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    await dbConnect();
    
    const rawPost = await Post
      .findOne({ slug })
      .lean()
      .exec();

    if (!rawPost) return null;

    const rec = isObject(rawPost) ? rawPost : ({} as Record<string, unknown>);
    const id = toString(rec._id ?? rec.id ?? slug);
    const postSlug = toString(rec.slug ?? slug);
    const title = toString(rec.title ?? postSlug);
    const content = toString(rec.content ?? "");
    const description = toString(rec.description ?? "");
    const date = toString(rec.date ?? rec.publishedAt ?? rec.createdAt ?? new Date().toISOString());
    const image = getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat)) ?? undefined;
    const tags = toStringArray(rec.tags);
    const author = toString(rec.author ?? rec.authorName ?? "Coffee Genius");
    const updatedAt = toString(rec.updatedAt ?? "");

    return { id, slug: postSlug, title, content, description, date, tags, image, author, updatedAt };
  } catch (error) {
    console.error("Error fetching post by slug:", error);
    return null;
  }
}