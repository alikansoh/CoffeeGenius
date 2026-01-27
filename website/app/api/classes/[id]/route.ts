import { NextResponse } from "next/server";
import connect from "@/lib/dbConnect";
import Course from "@/models/Class";

/**
 * GET /api/classes/:id
 * PATCH /api/classes/:id
 * DELETE /api/classes/:id
 *
 * This file has been hardened so route handlers will still work even if the
 * `params` bag is unexpectedly undefined. We also extract the id from the
 * request URL as a fallback (useful when certain runtimes or proxies omit params).
 */

async function findByIdOrSlug(idOrSlug: string | undefined) {
  if (!idOrSlug) return null;
  // try by ObjectId first
  if (/^[0-9a-fA-F]{24}$/.test(idOrSlug)) {
    const doc = await Course.findById(idOrSlug).lean();
    if (doc) return doc;
  }
  // otherwise try slug
  return Course.findOne({ slug: idOrSlug }).lean();
}

function extractId(request: Request, context: { params?: { id?: string } } = {}) {
  // Prefer Next.js-provided params
  let id = context?.params?.id;

  if (!id) {
    try {
      const url = new URL(request.url);
      // path like /api/classes/<id> or /api/classes/<id>/
      const parts = url.pathname.split("/").filter(Boolean);
      // last segment should be the id
      id = parts[parts.length - 1];
      if (id) id = decodeURIComponent(id);
    } catch (err) {
      // ignore - we'll handle missing id below
    }
  }

  // Normalise empty string -> undefined
  if (typeof id === "string" && id.trim() === "") id = undefined;
  return id;
}

export async function GET(request: Request, context: { params?: { id?: string } } = {}) {
  await connect();
  const id = extractId(request, context);
  if (!id) {
    return NextResponse.json({ success: false, message: "Missing id parameter" }, { status: 400 });
  }

  try {
    const course = await findByIdOrSlug(id);
    if (!course) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: course }, { status: 200 });
  } catch (err) {
    console.error("GET /api/classes/[id] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: "Failed to fetch course", error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params?: { id?: string } } = {}) {
  await connect();
  const id = extractId(request, context);
  if (!id) {
    return NextResponse.json({ success: false, message: "Missing id parameter" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const updatable = [
      "slug",
      "title",
      "subtitle",
      "price",
      "summary",
      "description",
      "durationMinutes",
      "capacity",
      "minPeople",
      "maxPeople",
      "instructor",
      "image",
      "images",
      "featured",
      "sessions",
      "thingsToNote",
      "furtherInformation",
      "location",
    ];

    const update: Record<string, unknown> = {};
    for (const key of updatable) {
      if (body[key] !== undefined) {
        if (key === "sessions") {
          update.sessions = (body.sessions || []).map((s: unknown) => {
            const sess = s as { start?: string; end?: string };
            return {
              start: sess.start ? new Date(sess.start) : undefined,
              end: sess.end ? new Date(sess.end) : undefined,
            };
          });
        } else if (key === "slug") {
          update.slug = String(body.slug).toLowerCase().trim();
        } else {
          update[key] = body[key];
        }
      }
    }

    const patched = await Course.findOneAndUpdate(
      { $or: [{ _id: id }, { slug: id }] },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!patched) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: patched }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/classes/[id] error:", err);
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      const errorMessage = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Unknown error';
      return NextResponse.json({ success: false, message: "Duplicate key", error: errorMessage }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: "Failed to update course", error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: { params?: { id?: string } } = {}) {
  await connect();
  const id = extractId(request, context);
  if (!id) {
    return NextResponse.json({ success: false, message: "Missing id parameter" }, { status: 400 });
  }

  try {
    const removed = await Course.findOneAndDelete({ $or: [{ _id: id }, { slug: id }] }).lean();
    if (!removed) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: removed._id } }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/classes/[id] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: "Failed to delete course", error: message },
      { status: 500 }
    );
  }
}