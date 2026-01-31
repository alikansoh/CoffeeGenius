"use server";

import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Order from "@/models/Order";
import mongoose from "mongoose";

/**
 * DELETE /api/orders/:id
 *
 * Robust handler with detailed logging for debugging:
 * - Accepts id from: path param, ?id=, JSON body { id } / { _id } / { orderRef } / { paymentIntentId }
 * - Accepts ObjectId-like strings and a few wrapped forms
 * - Tries deletion by _id (ObjectId) first, then falls back to common identifier fields
 * - Returns helpful JSON and logs the resolved id and branch taken
 *
 * NOTE:
 * - Add authentication/authorization as needed (e.g. verifyAuthForApi) before performing deletion.
 * - Remove or reduce verbose logs in production.
 */

/* Type guards and helpers */
type UnknownRecord = Record<string, unknown>;
function isObject(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}
function isThenable(v: unknown): v is Promise<unknown> {
  return isObject(v) && typeof (v as { then?: unknown }).then === "function";
}

/** Minimal shape we expect from .lean() for deleted documents */
type MinimalOrder = { _id: mongoose.Types.ObjectId | string; orderRef?: string | null };

/** Resolve promise-like / object / array to a plausible primitive id string */
async function resolveParamToString(maybe: unknown): Promise<string | undefined> {
  if (maybe == null) return undefined;

  // await thenables
  if (isThenable(maybe)) {
    try {
      const awaited = await maybe;
      return resolveParamToString(awaited);
    } catch {
      return undefined;
    }
  }

  if (typeof maybe === "string") return maybe;
  if (typeof maybe === "number" || typeof maybe === "boolean") return String(maybe);
  if (Array.isArray(maybe)) return maybe.length > 0 ? resolveParamToString(maybe[0]) : undefined;

  if (isObject(maybe)) {
    const obj = maybe as UnknownRecord;

    // direct fields
    if (obj.id) return resolveParamToString(obj.id);
    if (obj._id) return resolveParamToString(obj._id);

    // common alternate ids
    if (obj.orderRef) return resolveParamToString(obj.orderRef);
    if (obj.paymentIntentId) return resolveParamToString(obj.paymentIntentId);
    if (obj.clientId) return resolveParamToString(obj.clientId);

    // nested shapes
    if (obj.params && isObject(obj.params) && obj.params.id) return resolveParamToString((obj.params as UnknownRecord).id);
    if (obj.query && isObject(obj.query) && obj.query.id) return resolveParamToString((obj.query as UnknownRecord).id);

    // single-key object with primitive value
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const v = obj[keys[0]];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    }
  }

  return undefined;
}

/** Normalize id-like strings (handles {"$oid":"..."} and ObjectId("...") and 24-hex substrings) */
function normalizeIdString(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).trim();

  // JSON extended $oid
  if (/^\s*\{.*"\$oid".*\}\s*$/.test(s)) {
    try {
      const obj = JSON.parse(s) as UnknownRecord;
      if (obj && (obj.$oid || obj.oid)) return String(obj.$oid ?? obj.oid);
    } catch {
      // fallthrough
    }
  }

  // remove surrounding quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // ObjectId("...")
  const objIdMatch = s.match(/ObjectId\(["']?([0-9a-fA-F]{24})["']?\)/);
  if (objIdMatch) return objIdMatch[1];

  // 24 hex substring
  const hexMatch = s.match(/([0-9a-fA-F]{24})/);
  if (hexMatch) return hexMatch[1];

  return s.length > 0 ? s : undefined;
}

/** Extract id candidate from request (params, query, body, pathname) */
async function extractIdFromRequest(request: Request, paramsCandidate?: unknown): Promise<string | undefined> {
  // 1) paramsCandidate (handles Promise<{id}> from App Router)
  const fromParamsRaw = await resolveParamToString(paramsCandidate);
  const fromParams = normalizeIdString(fromParamsRaw);
  if (fromParams) return fromParams;

  // 2) ?id= query
  try {
    const url = new URL(request.url);
    const qRaw = url.searchParams.get("id") ?? undefined;
    const q = normalizeIdString(qRaw ?? undefined);
    if (q) return q;
  } catch {
    // ignore
  }

  // 3) last pathname segment (e.g. /api/orders/<id>)
  try {
    const pathname = new URL(request.url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      const lastRaw = parts[parts.length - 1];
      if (lastRaw && !["api", "orders", "order"].includes(lastRaw.toLowerCase())) {
        const last = normalizeIdString(decodeURIComponent(lastRaw));
        if (last) return last;
      }
    }
  } catch {
    // ignore
  }

  // 4) JSON body { id/_id/orderRef/paymentIntentId } or plain text
  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const clone = request.clone();
      const body = await clone.json().catch(() => null);
      if (isObject(body)) {
        const candidate = (body.id ?? body._id ?? body.orderRef ?? body.paymentIntentId ?? body.clientId) as unknown;
        const rawBodyId = await resolveParamToString(candidate);
        const normalized = normalizeIdString(rawBodyId);
        if (normalized) return normalized;
      }
    } else {
      // try plain text body (some clients send raw id)
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

/** escape regex helper */
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Handler */
export async function DELETE(
  request: Request,
  context?: { params?: { id?: string | string[] } | Promise<{ id: string }> }
) {
  // Optional: enforce auth here (uncomment and use your auth util)
  // const auth = await verifyAuthForApi(request);
  // if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
  } catch (err) {
    console.error("DELETE /api/orders DB connect error:", err);
    return NextResponse.json({ success: false, message: "Database connection failed" }, { status: 500 });
  }

  try {
    // Resolve id aggressively from params / query / body / pathname
    const resolvedId = await extractIdFromRequest(request, context?.params);
    // Log request meta for debugging
    const reqUrl = request.url;
    const method = request.method;
    const headersSnapshot: Record<string, string | null> = {
      host: request.headers.get("host"),
      "content-type": request.headers.get("content-type"),
      referer: request.headers.get("referer"),
      "user-agent": request.headers.get("user-agent"),
    };

    console.info("DELETE /api/orders invoked", { method, url: reqUrl, resolvedId, headers: headersSnapshot });

    if (!resolvedId) {
      console.warn("DELETE /api/orders missing id", { url: reqUrl });
      return NextResponse.json({ success: false, message: "Missing id" }, { status: 400 });
    }

    // Try ObjectId deletion first
    if (mongoose.Types.ObjectId.isValid(resolvedId)) {
      try {
        const removedById = (await Order.findByIdAndDelete(resolvedId).lean().exec()) as MinimalOrder | null;
        if (removedById) {
          console.info("DELETE /api/orders deleted by _id", { resolvedId });
          return NextResponse.json(
            {
              success: true,
              message: "Order deleted",
              data: { id: String(removedById._id), orderRef: removedById.orderRef ?? null },
            },
            { status: 200 }
          );
        }
      } catch (err) {
        console.error("DELETE /api/orders error when deleting by _id:", err);
        // continue to fallbacks
      }
    }

    // Fallbacks: try other identifier fields (exact and case-insensitive where appropriate)
    const orClauses: UnknownRecord[] = [];

    // exact matches
    orClauses.push({ orderRef: resolvedId });
    orClauses.push({ paymentIntentId: resolvedId });
    orClauses.push({ clientId: resolvedId });
    orClauses.push({ "shipment.trackingCode": resolvedId });

    // case-insensitive regex for short string matches (safe usage)
    const escaped = escapeRegex(resolvedId);
    try {
      orClauses.push({ orderRef: { $regex: `^${escaped}$`, $options: "i" } });
      orClauses.push({ paymentIntentId: { $regex: `^${escaped}$`, $options: "i" } });
    } catch {
      // ignore regex errors
    }

    // Run fallback deletion
    const removed = (await Order.findOneAndDelete({ $or: orClauses }).lean().exec()) as MinimalOrder | null;

    if (!removed) {
      console.warn("DELETE /api/orders not found", { resolvedId, url: reqUrl });
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    console.info("DELETE /api/orders deleted by fallback", { matchedId: String(removed._id), resolvedId });
    return NextResponse.json(
      { success: true, message: "Order deleted", data: { id: String(removed._id), orderRef: removed.orderRef ?? null } },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("DELETE /api/orders error:", message, err);
    return NextResponse.json({ success: false, message: "Failed to delete order", error: message }, { status: 500 });
  }
}