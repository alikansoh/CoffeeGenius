import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import GalleryItem from "@/models/GalleryItem";
import mongoose from "mongoose";
import { destroyPublicId, initCloudinary } from "@/lib/cloudinarySrever";
import { verifyAuthForApi } from "@/lib/auth";

function isValidObjectId(id?: string) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

/* GET (public) */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await context.params; // Resolve the promise
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

/* PUT (authenticated only) */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(req);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for PUT /api/gallery/[id]", err);
    return NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 401 });
  }

  await dbConnect();
  const { id } = await context.params; // Resolve the promise
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await req.json().catch(() => ({}));
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

/* DELETE (authenticated only) */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(req);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for DELETE /api/gallery/[id]", err);
    return NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 401 });
  }

  await dbConnect();
  const { id } = await context.params; // Resolve the promise
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const item = await GalleryItem.findById(id).lean();
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Attempt Cloudinary deletion if we have a publicId
    try {
      initCloudinary();
      const resourceType = ["image", "video", "auto"].includes(item.resourceType || "")
        ? (item.resourceType as "image" | "video" | "auto")
        : "auto";
      await destroyPublicId(item.publicId, resourceType);
    } catch (cloudErr) {
      console.warn("Cloudinary delete failed (continuing to remove DB record):", cloudErr);
      // Continue to delete DB entry anyway
    }

    const deleted = await GalleryItem.findByIdAndDelete(id).lean();
    return NextResponse.json({ ok: true, data: deleted }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/gallery/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to delete gallery item" }, { status: 500 });
  }
}