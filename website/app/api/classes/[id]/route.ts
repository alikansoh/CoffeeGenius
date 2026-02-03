import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbConnect";
import Course from "@/models/Class";
import { verifyAuthForApi } from "@/lib/auth";

type ContextLike = { params?: { id?: string | string[] } | Promise<{ id: string }> } | undefined;

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

function isThenable<T>(v: T | Promise<T> | undefined): v is Promise<T> {
  return !!v && typeof (v as Promise<T>).then === "function";
}

async function resolveId(request: NextRequest, context?: ContextLike): Promise<string | undefined> {
  // 1) try params (may be sync object or a Promise<{id: string}>)
  if (context && context.params !== undefined) {
    const p = context.params;
    if (isThenable(p)) {
      try {
        const resolved = await p;
        if (resolved?.id) return resolved.id;
      } catch {
        // fallthrough to other methods
      }
    } else {
      const idField = p.id;
      if (typeof idField === "string" && idField.trim() !== "") return idField;
      if (Array.isArray(idField) && idField.length > 0) return String(idField[0]);
    }
  }

  // 2) try parse from URL path /api/classes/<id>
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last && !["api", "classes"].includes(last.toLowerCase())) return decodeURIComponent(last);
    }
  } catch {
    // ignore
  }

  return undefined;
}

/* GET (public) */
export async function GET(request: NextRequest, context?: ContextLike) {
  await connect();
  const id = await resolveId(request, context);
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

/* PATCH (authenticated only) */
export async function PATCH(request: NextRequest, context?: ContextLike) {
  // Require authenticated user (no role check)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for PATCH /api/classes/[id]", err);
    return NextResponse.json({ success: false, message: "Authentication failed" }, { status: 401 });
  }

  await connect();
  const id = await resolveId(request, context);
  if (!id) {
    return NextResponse.json({ success: false, message: "Missing id parameter" }, { status: 400 });
  }

  try {
    const raw = await request.json().catch(() => ({})) as unknown;

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
    ] as const;

    const update: Record<string, unknown> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const body = raw as Record<string, unknown>;
      for (const key of updatable) {
        if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
          if (key === "sessions") {
            const input = body.sessions as unknown;
            if (Array.isArray(input)) {
              update.sessions = input.map((s) => {
                const sess = s as { start?: string; end?: string };
                return {
                  start: sess.start ? new Date(sess.start) : undefined,
                  end: sess.end ? new Date(sess.end) : undefined,
                };
              });
            } else {
              update.sessions = [];
            }
          } else if (key === "slug") {
            update.slug = String(body.slug ?? "").toLowerCase().trim();
          } else {
            update[key] = body[key];
          }
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
    if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === 11000) {
      const errorMessage = (err && typeof err === "object" && "message" in err) ? (err as { message: string }).message : "Duplicate key";
      return NextResponse.json({ success: false, message: "Duplicate key", error: errorMessage }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: "Failed to update course", error: message },
      { status: 500 }
    );
  }
}

/* DELETE (authenticated only) */
export async function DELETE(request: NextRequest, context?: ContextLike) {
  // Require authenticated user (no role check)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for DELETE /api/classes/[id]", err);
    return NextResponse.json({ success: false, message: "Authentication failed" }, { status: 401 });
  }

  await connect();
  const id = await resolveId(request, context);
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