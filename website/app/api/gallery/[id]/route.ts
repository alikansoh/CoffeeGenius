import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import GalleryItem from "@/models/GalleryItem";
import mongoose from "mongoose";
import { destroyPublicId, initCloudinary } from "@/lib/cloudinarySrever";

function isValidObjectId(id?: string) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const { id } =  params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const item = await GalleryItem.findById(id).lean();
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: item }, { status: 200 });
  } catch (err) {
    console.error("GET /api/gallery/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch gallery item" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await req.json();
    interface UpdateFields {
      title?: string;
      description?: string;
      alt?: string;
      active?: boolean;
    }

    const update: UpdateFields = {};
    if (typeof body.title === "string") update.title = body.title.trim();
    if (typeof body.description === "string") update.description = body.description.trim();
    if (typeof body.alt === "string") update.alt = body.alt.trim();
    if (typeof body.active === "boolean") update.active = body.active;

    const updated = await GalleryItem.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/gallery/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to update" }, { status: 500 });
  }
}

/**
 * DELETE: removes DB record and also attempts to delete from Cloudinary.
 * - It will attempt to delete the publicId; even if Cloudinary deletion fails, we still remove DB entry
 *   or respond appropriately depending on your preference. Here we attempt both and report what happened.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const item = await GalleryItem.findById(id).lean();
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // attempt Cloudinary deletion if we have a publicId
    try {
      initCloudinary();
      const resourceType = ["image", "video", "auto"].includes(item.resourceType || "")
        ? (item.resourceType as "image" | "video" | "auto")
        : "auto";
      await destroyPublicId(item.publicId, resourceType);
    } catch (cloudErr) {
      console.warn("Cloudinary delete failed (continuing to remove DB record):", cloudErr);
      // continue to delete DB entry anyway
    }

    const deleted = await GalleryItem.findByIdAndDelete(id).lean();
    return NextResponse.json({ ok: true, data: deleted }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/gallery/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to delete gallery item" }, { status: 500 });
  }
}