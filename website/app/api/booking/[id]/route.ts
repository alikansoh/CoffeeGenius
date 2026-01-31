"use server";

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Booking from "@/models/Booking";
import { verifyAuthForApi } from "@/lib/auth";
import mongoose from "mongoose";

/**
 * DELETE /api/booking/:id
 *
 * Accepts id from:
 *  - path param /api/booking/:id
 *  - ?id= query
 *  - JSON body { id } or { _id } or { bookingRef }
 *  - plain body text
 * Also accepts wrapped forms like {"$oid":"..."} or ObjectId("...").
 */

/** Type helpers for safer runtime checks */
type UnknownRecord = Record<string, unknown>;
function isObject(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

/** Detect thenable/promise-like values */
function isThenable(v: unknown): v is Promise<unknown> {
  return isObject(v) && typeof (v as { then?: unknown }).then === "function";
}

/** Helper to safely await promise-like and normalize common object shapes to a string id */
async function resolveParamToString(maybe: unknown): Promise<string | undefined> {
  if (maybe == null) return undefined;

  // If it's promise-like, await it and then continue processing with the resolved value
  if (isThenable(maybe)) {
    try {
      const awaited = await maybe;
      return resolveParamToString(awaited);
    } catch {
      return undefined;
    }
  }

  // Strings
  if (typeof maybe === "string") {
    return maybe;
  }

  // Arrays -> use first element
  if (Array.isArray(maybe)) {
    if (maybe.length === 0) return undefined;
    return resolveParamToString(maybe[0]);
  }

  // Numbers / booleans
  if (typeof maybe === "number" || typeof maybe === "boolean") {
    return String(maybe);
  }

  // Plain object: try common id fields
  if (isObject(maybe)) {
    const obj = maybe as UnknownRecord;

    // Common direct id fields
    if (obj.id) return resolveParamToString(obj.id);
    if (obj._id) return resolveParamToString(obj._id);

    // Common nested shapes (params, query)
    const paramsCandidate = obj.params;
    if (isObject(paramsCandidate) && "id" in paramsCandidate) {
      return resolveParamToString((paramsCandidate as UnknownRecord).id);
    }

    const queryCandidate = obj.query;
    if (isObject(queryCandidate) && "id" in queryCandidate) {
      return resolveParamToString((queryCandidate as UnknownRecord).id);
    }

    // bookingRef-like fields
    if (obj.bookingRef) return resolveParamToString(obj.bookingRef);
    if (obj.ref) return resolveParamToString(obj.ref);
    if (obj.code) return resolveParamToString(obj.code);
    if (obj.slug) return resolveParamToString(obj.slug);

    // Fallback: if object has a single primitive-valued key, use that
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const v = obj[keys[0]];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return String(v);
      }
    }
  }

  return undefined;
}

/** Normalize a possibly-wrapped id string to a plain string */
function normalizeIdString(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).trim();

  // JSON extended form with $oid
  if (/^\s*\{.*"\$oid".*\}\s*$/.test(s)) {
    try {
      const obj = JSON.parse(s) as UnknownRecord;
      if (obj && (obj.$oid || obj.oid)) return String(obj.$oid ?? obj.oid);
    } catch {
      // fallthrough
    }
  }

  // Quoted string like '"abc"'
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // ObjectId("...") pattern
  const objIdMatch = s.match(/ObjectId\(["']?([0-9a-fA-F]{24})["']?\)/);
  if (objIdMatch) return objIdMatch[1];

  // 24 hex substring
  const hexMatch = s.match(/([0-9a-fA-F]{24})/);
  if (hexMatch) return hexMatch[1];

  return s.length > 0 ? s : undefined;
}

async function extractIdFromRequest(
  request: NextRequest,
  paramsCandidate?: unknown
): Promise<string | undefined> {
  // 1) try paramsCandidate (handles promises, objects, arrays)
  const fromParamsRaw = await resolveParamToString(paramsCandidate);
  const fromParams = normalizeIdString(fromParamsRaw);
  if (fromParams) return fromParams;

  // 2) try URL search param ?id=
  try {
    const url = new URL(request.url);
    const qRaw = url.searchParams.get("id") ?? undefined;
    const q = normalizeIdString(qRaw ?? undefined);
    if (q) return q;
  } catch {
    // ignore invalid URL
  }

  // 3) try pathname last segment (e.g., /api/booking/<id>)
  try {
    const pathname = new URL(request.url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      const lastRaw = parts[parts.length - 1];
      // skip if the last segment is the collection root
      if (lastRaw && !["api", "booking", "bookings"].includes(lastRaw.toLowerCase())) {
        const last = normalizeIdString(decodeURIComponent(lastRaw));
        if (last) return last;
      }
    }
  } catch {
    // ignore
  }

  // 4) try JSON body { id } or { _id } or { bookingRef }
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const clone = request.clone();
      const body = await clone.json().catch(() => null);
      if (isObject(body)) {
        const candidate = (body.id ?? body._id ?? body.bookingRef ?? body.ref ?? body.code ?? body.slug) as unknown;
        const rawBodyId = await resolveParamToString(candidate);
        const normalized = normalizeIdString(rawBodyId);
        if (normalized) return normalized;
      }
    } else {
      // If not JSON, try plain text body (some clients POST raw id)
      const clone = request.clone();
      const txt = await clone.text().catch(() => "");
      const normalized = normalizeIdString(txt || undefined);
      if (normalized) return normalized;
    }
  } catch {
    // ignore
  }

  return undefined;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function DELETE(
  request: NextRequest,
  context?: { params?: { id?: string | string[] } | Promise<{ id: string }> }
) {
  // Enforce authentication/authorization
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
  } catch (err) {
    console.error("DB connect error:", err);
    return NextResponse.json({ success: false, message: "Database connection failed" }, { status: 500 });
  }

  try {
    const id = await extractIdFromRequest(request, context?.params);
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing id" }, { status: 400 });
    }

    // Minimal debug log (remove in production)
    console.debug("DELETE /api/booking resolved id:", id);

    // 1) Try deletion by _id when id is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      const removedById = await Booking.findByIdAndDelete(id).lean();
      if (removedById) {
        return NextResponse.json(
          { success: true, data: { id: String(removedById._id), bookingRef: removedById.bookingRef ?? null } },
          { status: 200 }
        );
      }
    }

    // 2) Fallback: try other identifier fields (case-insensitive bookingRef, exact ref/code/slug)
    const orClauses: UnknownRecord[] = [];

    // case-insensitive match for bookingRef
    orClauses.push({ bookingRef: { $regex: `^${escapeRegex(id)}$`, $options: "i" } });

    // exact matches for other possible fields
    orClauses.push({ ref: id });
    orClauses.push({ code: id });
    orClauses.push({ slug: id });

    // numeric bookingNumber support
    if (/^\d+$/.test(id)) {
      orClauses.push({ bookingNumber: Number(id) });
    }

    const removed = await Booking.findOneAndDelete({ $or: orClauses }).lean();

    if (!removed) {
      return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, data: { id: String(removed._id), bookingRef: removed.bookingRef ?? null } },
      { status: 200 }
    );
  } catch (err) {
    console.error("DELETE /api/booking/:id error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to delete booking", error: message }, { status: 500 });
  }
}