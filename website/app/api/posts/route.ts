import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Post from "@/models/Post";
import { initCloudinary, uploadBufferToCloudinary } from "@/lib/cloudinarySrever";
import { verifyAuthForApi } from "@/lib/auth";

// Type for Cloudinary upload responses
interface CloudinaryUploadResult {
  public_id: string;
  format?: string;
  resource_type?: string;
  [key: string]: unknown;
}

// Type for Post response data object (matching aliased keys used in response)
interface PostResponseData {
  _id: string; // <-- Always included!
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

export async function GET(request: Request) {
  await dbConnect();

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 0);
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const sort = url.searchParams.get("sort") ?? "-createdAt";
    const tag = url.searchParams.get("tag");
    const q = url.searchParams.get("q");

    interface Filter {
      tags?: string;
      $or?: Array<{ title: RegExp } | { excerpt: RegExp } | { content: RegExp }>;
    }
    const filter: Filter = {};
    if (tag) filter.tags = tag;
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [{ title: rx }, { excerpt: rx }, { content: rx }];
    }

    const query = Post.find(filter).sort(sort).skip(skip);
    if (limit > 0) query.limit(limit);
    const docs = await query.exec();

    const data: PostResponseData[] = docs.map((d) => {
      const { _id, ...rest } = d.toObject();
      const obj: PostResponseData = {
        _id: d._id.toString(),
        ...rest,
        date: d.date instanceof Date ? d.date.toISOString() : undefined,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : undefined,
        updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : undefined,
        image: d.imagePublicId || undefined,
        description: d.content || undefined,
        slug: d.slug || undefined, // Always return the slug in API
      };
      if (!obj.image && obj.imagePublicId) obj.image = obj.imagePublicId;
      if (!obj.description && obj.content) obj.description = obj.content;
      return obj;
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(request as unknown as NextRequest);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for POST /api/posts", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  await dbConnect();

  try {
    const contentType = request.headers.get("content-type") || "";

    let imagePublicId: string | undefined;
    let imageFormat: string | undefined;
    let imageResourceType: string | undefined;

    // 1) Handle multipart/form-data (file upload + other fields)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();

      // Support single file via "image" or "file", or multiple via "files"
      const single = formData.get("image") ?? formData.get("file");
      const multiple = formData.getAll("files") as File[] | undefined;
      const folder = formData.get("folder")?.toString() || "posts";

      // prefer multiple if provided
      const fileToUse: File | null =
        multiple && multiple.length > 0 ? (multiple[0] as unknown as File) : (single as File | null);

      if (fileToUse && typeof (fileToUse as File).arrayBuffer === "function") {
        const arrayBuffer = await fileToUse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const resource_type =
          (fileToUse.type && fileToUse.type.startsWith("video/")) ||
          /\.(mp4|mov|webm|avi|m4v|mkv|flv|mts|m2ts|3gp|ogv)$/i.test(fileToUse.name || "")
            ? "video"
            : "image";

        initCloudinary();
        const uploadResult = await uploadBufferToCloudinary(buffer, {
          folder,
          resource_type,
        }) as CloudinaryUploadResult;

        imagePublicId = uploadResult.public_id;
        imageFormat = uploadResult.format;
        imageResourceType = uploadResult.resource_type;
      }

      // Build Post from form fields
      const title = formData.get("title")?.toString();
      if (!title) {
        return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
      }

      const contentField = formData.get("content")?.toString() ?? formData.get("description")?.toString();

      const p = new Post({
        title,
        slug: formData.get("slug")?.toString(),
        url: formData.get("url")?.toString(),
        date: formData.get("date") ? new Date(formData.get("date")!.toString()) : undefined,
        excerpt: formData.get("excerpt")?.toString(),
        content: contentField,
        imagePublicId: imagePublicId ?? formData.get("imagePublicId")?.toString() ?? undefined,
        imageFormat: imageFormat ?? formData.get("imageFormat")?.toString() ?? undefined,
        imageResourceType: imageResourceType ?? formData.get("imageResourceType")?.toString() ?? undefined,
        tags: formData.get("tags") ? formData.get("tags")!.toString().split(",").map((t) => t.trim()) : [],
      });

      const created = await p.save();
      const { _id, ...rest } = created.toObject();

      const data: PostResponseData = {
        _id: created._id.toString(),
        ...rest,
        date: created.date ? created.date.toISOString() : undefined,
        createdAt: created.createdAt ? created.createdAt.toISOString() : undefined,
        updatedAt: created.updatedAt ? created.updatedAt.toISOString() : undefined,
        image: created.imagePublicId || undefined,
        description: created.content || undefined,
        slug: created.slug || undefined, // Always return the slug in API
      };

      if (data.imagePublicId && !data.image) data.image = data.imagePublicId;
      if (data.content && !data.description) data.description = data.content;

      return NextResponse.json({ data }, { status: 201 });
    }

    // 2) Handle JSON body (optionally with imageBase64)
    const body = await request.json().catch(() => null);
    if (!body || !body.title) {
      return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
    }

    if (body.imageBase64 && typeof body.imageBase64 === "string") {
      const match = body.imageBase64.match(/^data:(.+);base64,(.*)$/);
      let buffer: Buffer;
      let guessedType: string | undefined;
      if (match) {
        guessedType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        buffer = Buffer.from(body.imageBase64, "base64");
      }

      initCloudinary();
      const uploadResult = await uploadBufferToCloudinary(buffer, {
        folder: body.folder || "posts",
        resource_type: guessedType?.startsWith("video/") ? "video" : "image",
      }) as CloudinaryUploadResult;

      imagePublicId = uploadResult.public_id;
      imageFormat = uploadResult.format;
      imageResourceType = uploadResult.resource_type;
    }

    const contentField = body.content ?? body.description ?? undefined;

    const p = new Post({
      title: body.title,
      slug: body.slug,
      url: body.url,
      date: body.date ? new Date(body.date) : undefined,
      excerpt: body.excerpt,
      content: contentField,
      imagePublicId: imagePublicId ?? body.imagePublicId ?? body.image ?? undefined,
      imageFormat: imageFormat ?? body.imageFormat,
      imageResourceType: imageResourceType ?? body.imageResourceType,
      tags: body.tags || [],
    });

    const created = await p.save();
    const { _id, ...rest } = created.toObject();
    const data: PostResponseData = {
      _id: created._id.toString(),
      ...rest,
      date: created.date ? created.date.toISOString() : undefined,
      createdAt: created.createdAt ? created.createdAt.toISOString() : undefined,
      updatedAt: created.updatedAt ? created.updatedAt.toISOString() : undefined,
      image: created.imagePublicId || undefined,
      description: created.content || undefined,
      slug: created.slug || undefined, // Always return the slug in API
    };

    if (data.imagePublicId && !data.image) data.image = data.imagePublicId;
    if (data.content && !data.description) data.description = data.content;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/posts error:", err);
    return NextResponse.json(
      { error: "Failed to create post", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}