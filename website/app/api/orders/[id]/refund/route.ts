"use server";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import dbConnect from "@/lib/dbConnect";
import Order from "@/models/Order";
import mongoose from "mongoose";
import { notifyRefundToCustomer } from "@/lib/notifyRefund";
import { verifyAuthForApi } from "@/lib/auth";

interface RefundRecord {
  refundId: string;
  amount: number;
  currency: string;
  reason: string | null;
  refundedAt: string;
  paymentProviderRefundId: string | null;
  idempotencyKey: string | null;
  stripeResponse?: { id: string; status: string };
}

interface OrderLike {
  [key: string]: unknown;
}

type RefundInput = {
  amount: number;
  reason?: string;
  currency?: string;
  idempotencyKey?: string;
};

function toMinorUnit(amount: number, currency = "GBP"): number {
  const zeroDecimal = new Set(["JPY", "VND", "KRW"]);
  const cur = (currency || "GBP").toUpperCase();
  return zeroDecimal.has(cur) ? Math.round(amount) : Math.round(amount * 100);
}

function safeParseBody(raw: unknown): RefundInput {
  if (!raw || typeof raw !== "object") throw new Error("Invalid body");
  const obj = raw as Record<string, unknown>;
  const amount =
    typeof obj.amount === "number"
      ? obj.amount
      : typeof obj.amount === "string"
      ? Number(obj.amount)
      : NaN;
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : undefined;
  const currency = typeof obj.currency === "string" ? obj.currency.trim() : undefined;
  const idempotencyKey =
    typeof obj.idempotencyKey === "string" ? obj.idempotencyKey.trim() : undefined;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid refund amount");
  return { amount, reason, currency, idempotencyKey };
}

// Note: params is a Promise in Next.js app router — await it before use.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  // --- ADDED: require authentication before processing refund ---
  try {
    const auth = await verifyAuthForApi(req as unknown as NextRequest);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for POST /api/orders/[id]/refund", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  // --- end auth ---

  // resolve params promise
  const { params } = context;
  const { id } = await params;

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("Stripe secret missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-12-15.clover" });

  // parse body
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let input: RefundInput;
  try {
    input = safeParseBody(bodyJson);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!id) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  // optional header idempotency key preferred
  const headerIdempotency =
    req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key") || undefined;
  const idempotencyKey = input.idempotencyKey || headerIdempotency;

  await dbConnect();

  const order = await Order.findById(id).lean().exec();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const meta = (order as { metadata?: Record<string, unknown> }).metadata ?? {};
  const legacyRefundAmount = (order as { refund?: { amount?: number } }).refund?.amount ?? 0;
  const refundsArr: RefundRecord[] = Array.isArray(meta.refunds) ? (meta.refunds as RefundRecord[]) : [];
  const refundedSoFarFromMetadata = refundsArr.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const refundedSoFar = Number(legacyRefundAmount) || refundedSoFarFromMetadata || 0;

  const total = Number((order as { total?: number }).total || 0);
  const refundable = Math.max(0, Number((total - refundedSoFar).toFixed(2)));

  if (input.amount > refundable + 0.0001) {
    return NextResponse.json(
      { error: "Refund amount exceeds refundable amount", refundable },
      { status: 409 }
    );
  }

  // idempotency check (saved on order.metadata.refunds by key)
  if (idempotencyKey) {
    const existing = refundsArr.find((r) => r.idempotencyKey === idempotencyKey);
    if (existing) {
      return NextResponse.json({ data: { refund: existing, order } }, { status: 200 });
    }
  }

  const paymentIntentId = (order as { paymentIntentId?: string }).paymentIntentId;

  let stripeRefund: Stripe.Response<Stripe.Refund> | null = null;
  let stripeError: unknown = null;
  try {
    if (paymentIntentId) {
      const currency = (input.currency || (order as { currency?: string }).currency || "GBP").toString().toUpperCase();
      const amountMinor = toMinorUnit(input.amount, currency);

      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: amountMinor,
          reason: "requested_by_customer",
          metadata: {
            orderId: String(order._id),
            reason: input.reason || "",
          },
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );
    }
  } catch (err) {
    console.error("Stripe refund failed", err);
    stripeError = err;
  }

  const refundRecord: RefundRecord = {
    refundId: stripeRefund?.id ?? `manual_${new mongoose.Types.ObjectId().toString()}`,
    amount: Number(input.amount),
    currency: (input.currency || (order as { currency?: string }).currency || "GBP").toString().toUpperCase(),
    reason: input.reason || null,
    refundedAt: new Date().toISOString(),
    paymentProviderRefundId: stripeRefund?.id ?? null,
    idempotencyKey: idempotencyKey ?? null,
    // ensure stripeResponse.status is always a string (avoid null)
    stripeResponse: stripeRefund ? { id: stripeRefund.id, status: stripeRefund.status ?? "unknown" } : undefined,
  };

  try {
    // Build updated metadata.refunds and refunded totals
    const updatedMetadata: Record<string, unknown> = { ...(meta || {}) };
    updatedMetadata.refunds = Array.isArray(updatedMetadata.refunds)
      ? (updatedMetadata.refunds as RefundRecord[]).slice()
      : [];
    (updatedMetadata.refunds as RefundRecord[]).push(refundRecord);

    const newRefundedTotal = Number((refundedSoFar + refundRecord.amount).toFixed(2));
    updatedMetadata.refundedAmount = newRefundedTotal;
    updatedMetadata.lastRefund = {
      ...refundRecord,
    };

    // Determine status: refunded (full) or partially_refunded
    const isFullyRefunded = newRefundedTotal >= (total - 0.0001);
    const newStatus = isFullyRefunded ? "refunded" : "partially_refunded";

    // Build the refund field on order root for backwards compatibility
    const refundRoot = {
      refundId: refundRecord.refundId,
      amount: newRefundedTotal,
      refundedAt: new Date().toISOString(),
      reason: refundRecord.reason,
      paymentProviderRefundId: refundRecord.paymentProviderRefundId,
      details: refundRecord,
    };

    // Persist updates
    const updated = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          metadata: updatedMetadata,
          status: newStatus,
          refund: refundRoot,
        },
      },
      { new: true }
    ).lean().exec();

    // If Stripe failed but we still recorded a manual refund, flag it
    if (!stripeRefund) {
      await Order.findByIdAndUpdate(
        order._id,
        {
          $set: {
            "metadata.refundError": stripeError
              ? stripeError instanceof Error
                ? stripeError.message
                : String(stripeError)
              : null,
            "metadata.refundAttemptedAt": new Date().toISOString(),
          },
        }
      ).exec();
    }

    // Notify customer about refund (best-effort; do not fail the refund if email fails)
    (async () => {
      try {
        // updated is the fresh order document (lean). Cast via unknown to OrderLike to satisfy TS.
        const notifyResult = await notifyRefundToCustomer({ order: updated as unknown as OrderLike, refund: refundRecord });
        if (!notifyResult.sent) {
          console.error("Refund email not sent:", notifyResult.error);
          // Optionally attach metadata noting email failure:
          await Order.findByIdAndUpdate(
            order._id,
            { $set: { "metadata.lastRefundEmailError": notifyResult.error || "unknown" } }
          ).exec();
        } else {
          // Optionally save lastRefundEmailSentAt
          await Order.findByIdAndUpdate(order._id, {
            $set: { "metadata.lastRefundEmailSentAt": new Date().toISOString() },
          }).exec();
        }
      } catch (err) {
        console.error("Failed to send refund email:", err);
        // best-effort only
      }
    })();

    return NextResponse.json({ data: { refund: refundRecord, order: updated } }, { status: 200 });
  } catch (err) {
    console.error("Failed to persist refund info on order:", err);
    return NextResponse.json({ error: "Failed to record refund" }, { status: 500 });
  }
}