import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import GalleryItem from "@/models/GalleryItem";
import { initCloudinary, uploadBufferToCloudinary } from "@/lib/cloudinarySrever";

export const runtime = "nodejs";

/**
 * GET /api/gallery
 * - optional query: active=true|false
 * - sorts newest-first by createdAt
 */
export async function GET(req: Request) {
  await dbConnect();

  try {
    const url = new URL(req.url);
    const active = url.searchParams.get("active");
    const filter: Record<string, unknown> = {};
    if (active === "true") filter.active = true;
    if (active === "false") filter.active = false;

    const items = await GalleryItem.find(filter).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ ok: true, data: items }, { status: 200 });
  } catch (err) {
    console.error("GET /api/gallery error:", err);
    return NextResponse.json({ ok: false, error: "Failed to list gallery items" }, { status: 500 });
  }
}

/**
 * POST /api/gallery
 * Accepts multipart/form-data with field 'files' (one or many).
 * Optional fields:
 * - folder: string (Cloudinary folder)
 * - meta: JSON string or per-file metadata (not implemented per-file in this simple example)
 *
 * Behavior:
 * - Uploads each file to Cloudinary (using server upload)
 * - Creates a GalleryItem record per upload with metadata from Cloudinary and optional title/description
 */
export async function POST(req: Request) {
  await dbConnect();
  initCloudinary();

  try {
    const formData = await (req as Request).formData();
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((f: File | unknown) => typeof (f as File)?.arrayBuffer === "function") as File[];
    const folder = (formData.get("folder") as string) || "coffee-shop";
    // optional global title / description to attach to all items (or you can pass per-file metadata in a more advanced API)
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";

    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: 'No files in field "files"' }, { status: 400 });
    }

    const createdItems: Array<InstanceType<typeof GalleryItem>> = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // determine resource type (video vs image)
      const resourceType =
        (file.type && file.type.startsWith("video/")) ||
        /\.(mp4|mov|webm|avi|m4v|mkv|flv|mts|m2ts|3gp|ogv)$/i.test(file.name)
          ? "video"
          : "image";

      interface UploadResult {
        public_id: string;
        secure_url: string;
        format: string;
        resource_type: string;
        width?: number;
        height?: number;
        duration?: number;
        bytes?: number;
      }

      const uploadResult = await uploadBufferToCloudinary(buffer, {
        folder,
        resource_type: resourceType as "image" | "video" | "auto",
      }) as UploadResult;

      const doc = await GalleryItem.create({
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        format: uploadResult.format,
        resourceType: uploadResult.resource_type,
        width: uploadResult.width ?? null,
        height: uploadResult.height ?? null,
        duration: uploadResult.duration ?? null,
        bytes: uploadResult.bytes ?? null,
        title,
        description,
        active: true,
      });

      createdItems.push(doc);
    }

    return NextResponse.json({ ok: true, data: createdItems }, { status: 201 });
  } catch (err) {
    console.error("POST /api/gallery error:", err);
    return NextResponse.json({ ok: false, error: "Failed to upload and create gallery items" }, { status: 500 });
  }
}