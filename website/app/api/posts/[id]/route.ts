import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Post, { type IPost } from "@/models/Post";
import { initCloudinary, uploadBufferToCloudinary } from "@/lib/cloudinarySrever";

// --- Types ---
type RouteContext = { params: Promise<{ id: string }> };

type FileLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
  type?: string;
};

type UploadResult = {
  public_id: string;
  secure_url?: string;
  format?: string;
  resource_type?: string;
  width?: number;
  height?: number;
  bytes?: number;
  [key: string]: unknown;
};

interface PostResponseData {
  _id?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  tags?: string[];
  imagePublicId?: string;
  image?: string;
  imageFormat?: string;
  imageResourceType?: string;
  slug?: string;
  url?: string;
  description?: string;
  [key: string]: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTags(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return value.split(",").map((t) => t.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return undefined;
}

// ---- GET handler ----
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  await dbConnect();

  let doc: IPost | null = null;
  if (mongoose.isValidObjectId(id)) {
    doc = await Post.findById(id).exec();
  }
  if (!doc) {
    doc = await Post.findOne({ slug: id }).exec();
  }
  if (!doc) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const obj: PostResponseData = {
    _id: doc._id.toString(),
    date: doc.date instanceof Date ? doc.date.toISOString() : undefined,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : undefined,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : undefined,
    title: doc.title,
    excerpt: doc.excerpt,
    content: doc.content,
    tags: Array.isArray(doc.tags) ? doc.tags : undefined,
    imagePublicId: doc.imagePublicId,
    imageFormat: doc.imageFormat,
    imageResourceType: doc.imageResourceType,
    slug: doc.slug,
    url: doc.url,
    description: doc.content,
  };

  if (!obj.image && obj.imagePublicId) obj.image = obj.imagePublicId;
  if (!obj.description && obj.content) obj.description = obj.content;

  return NextResponse.json({ data: obj }, { status: 200 });
}

// ---- PUT handler ----
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  await dbConnect();

  let doc: IPost | null = null;
  if (mongoose.isValidObjectId(id)) {
    doc = await Post.findById(id).exec();
  }
  if (!doc) {
    doc = await Post.findOne({ slug: id }).exec();
  }
  if (!doc) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const updateId = doc._id;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const update: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      // Process files and other fields
      const fileCandidate = formData.get("image") as FileLike | null;
      if (fileCandidate && typeof fileCandidate.arrayBuffer === "function") {
        const buffer = Buffer.from(await fileCandidate.arrayBuffer());
        initCloudinary();
        const uploadResult = (await uploadBufferToCloudinary(buffer, {
          folder: "posts",
          resource_type: "image",
        })) as UploadResult;

        update.imagePublicId = uploadResult.public_id;
        if (uploadResult.format) update.imageFormat = uploadResult.format;
        if (uploadResult.resource_type) update.imageResourceType = uploadResult.resource_type;
      }

      const title = formData.get("title")?.toString();
      if (title) update.title = title;

      const slug = formData.get("slug")?.toString();
      if (slug) update.slug = slug;

      const url = formData.get("url")?.toString();
      if (url) update.url = url;

      const dateValue = formData.get("date")?.toString();
      if (dateValue) {
        const parsed = new Date(dateValue);
        if (!Number.isNaN(parsed.getTime())) update.date = parsed;
      }

      const excerpt = formData.get("excerpt")?.toString();
      if (excerpt) update.excerpt = excerpt;

      const contentField = formData.get("content")?.toString() ?? formData.get("description")?.toString();
      if (contentField) update.content = contentField;

      const tagsValue = formData.get("tags");
      const tags = parseTags(tagsValue);
      if (tags) update.tags = tags;
    } else {
      const rawBody = await req.json().catch(() => null);
      if (!isObject(rawBody)) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const body = rawBody;

      if (body.title && typeof body.title === "string") update.title = body.title;
      if (body.slug && typeof body.slug === "string") update.slug = body.slug;
      if (body.url && typeof body.url === "string") update.url = body.url;

      if (body.date && typeof body.date === "string") {
        const parsed = new Date(body.date);
        if (!Number.isNaN(parsed.getTime())) update.date = parsed;
      }

      if (body.excerpt && typeof body.excerpt === "string") update.excerpt = body.excerpt;

      if (body.content && typeof body.content === "string") update.content = body.content;
      else if (body.description && typeof body.description === "string") update.content = body.description;

      const tags = parseTags(body.tags);
      if (tags) update.tags = tags;

      if (body.imageBase64 && typeof body.imageBase64 === "string") {
        const match = body.imageBase64.match(/^data:(.+);base64,(.*)$/);
        let buffer: Buffer;
        let guessedType: string | undefined;
        if (match) {
          guessedType = match[1];
          buffer = Buffer.from(match[2], "base64");
        } else {
          buffer = Buffer.from(body.imageBase64 as string, "base64");
        }

        initCloudinary();
        const uploadResult = await uploadBufferToCloudinary(buffer, {
          folder: typeof body.folder === "string" ? body.folder : "posts",
          resource_type: guessedType?.startsWith("video/") ? "video" : "image",
        }) as UploadResult;

        update.imagePublicId = uploadResult.public_id;
        if (uploadResult.format) update.imageFormat = uploadResult.format;
        if (uploadResult.resource_type) update.imageResourceType = uploadResult.resource_type;
      }

      if (body.image && typeof body.image === "string") {
        update.imagePublicId = body.image;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await Post.findByIdAndUpdate(updateId, update, { new: true }).exec();
    if (!updated) {
      return NextResponse.json({ error: "Post not found after update" }, { status: 404 });
    }

    const obj: PostResponseData = {
      _id: updated._id.toString(),
      date: updated.date instanceof Date ? updated.date.toISOString() : undefined,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : undefined,
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : undefined,
      title: updated.title,
      excerpt: updated.excerpt,
      content: updated.content,
      tags: Array.isArray(updated.tags) ? updated.tags : undefined,
      imagePublicId: updated.imagePublicId,
      imageFormat: updated.imageFormat,
      imageResourceType: updated.imageResourceType,
      slug: updated.slug,
      url: updated.url,
      description: updated.content,
    };

    if (!obj.image && obj.imagePublicId) obj.image = obj.imagePublicId;
    if (!obj.description && obj.content) obj.description = obj.content;

    return NextResponse.json({ data: obj }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/posts/[id] error:", err);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// ---- DELETE handler ----
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  await dbConnect();

  let doc: IPost | null = null;
  if (mongoose.isValidObjectId(id)) {
    doc = await Post.findById(id);
  }
  if (!doc) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  try {
    await Post.deleteOne({ _id: doc._id });
    return NextResponse.json({ success: true, message: "Post deleted" }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/posts/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}