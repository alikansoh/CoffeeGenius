import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Booking from "@/models/Booking";
import { verifyAuthForApi } from "@/lib/auth";
import mongoose from "mongoose";

/**
 * DELETE /api/bookings/:id
 *   - Admin only (requires verifyAuthForApi)
 *
 * Robust param resolution:
 * - Accepts params.id (string | Promise<string> | string[])
 * - Falls back to URL pathname parsing
 * - Falls back to query param `id`
 * - Falls back to JSON body { id }
 *
 * This makes the route tolerant to small changes in Next.js / runtime shapes.
 */

async function resolveParamToString(maybe: unknown): Promise<string | undefined> {
  if (maybe == null) return undefined;
  // If it's a promise-like object, await it.
  if (typeof maybe === 'object' && maybe !== null && 'then' in maybe && typeof (maybe as { then: unknown }).then === 'function') {
    try {
      const awaited = await (maybe as Promise<unknown>);
      if (awaited == null) return undefined;
      if (typeof awaited === "string") return awaited;
      if (Array.isArray(awaited)) return awaited.length > 0 ? String(awaited[0]) : undefined;
      return String(awaited);
    } catch {
      return undefined;
    }
  }
  if (typeof maybe === "string") return maybe;
  if (Array.isArray(maybe)) return maybe.length > 0 ? String(maybe[0]) : undefined;
  return String(maybe);
}

async function extractIdFromRequest(request: NextRequest, paramsCandidate?: unknown) {
  // 1) try params (may be string | Promise | array)
  const fromParams = await resolveParamToString(paramsCandidate);
  if (fromParams) return fromParams;

  // 2) try URL search param ?id=
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("id");
    if (q) return q;
  } catch {
    // ignore
  }

  // 3) try pathname last segment (e.g., /api/bookings/<id>)
  try {
    const pathname = new URL(request.url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      // last part is id if path ends with it and not 'route' etc.
      const last = parts[parts.length - 1];
      // ensure last is not 'api' or 'bookings'
      if (last && !["api", "bookings"].includes(last.toLowerCase())) {
        return decodeURIComponent(last);
      }
    }
  } catch {
    // ignore
  }

  // 4) try JSON body { id }
  try {
    const clone = request.clone();
    const body = await clone.json().catch(() => null);
    if (body && (body.id || body._id)) return String(body.id ?? body._id);
  } catch {
    // ignore
  }

  return undefined;
}

export async function DELETE(request: NextRequest, { params }: { params?: { id?: string | Promise<string> | string[] } }) {
  // require auth for deletion
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();

    const id = await extractIdFromRequest(request, params?.id);
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing id" }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid booking id" }, { status: 400 });
    }

    const removed = await Booking.findByIdAndDelete(id).lean();
    if (!removed) return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: { id: removed._id, bookingRef: removed.bookingRef } }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/bookings/:id error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to delete booking", error: message }, { status: 500 });
  }
}