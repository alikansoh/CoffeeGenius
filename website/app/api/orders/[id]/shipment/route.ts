import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Order from "@/models/Order";
import { sendAdminNotification } from "@/lib/notificationService";
import { notifyShipmentToCustomer } from "@/lib/notifyShipment";

interface OrderLike {
  [key: string]: unknown;
}

interface ShipmentHistoryEntry {
  provider: string;
  trackingCode: string | null;
  estimatedDelivery: string | null;
  shippedAt: string;
  by: string;
}

interface OrderMetadata {
  shipmentHistory?: ShipmentHistoryEntry[];
  lastShippedAt?: string;
  lastShippedBy?: string;
  [key: string]: unknown;
}

/**
 * App Route: POST /app/api/orders/[id]/shipment
 *
 * Notes:
 * - In Next.js 16+, `params` may be provided as a Promise. We `await` it here.
 * - This handler parses the body once and resolves the order id from:
 *   1) params.id (preferred)
 *   2) URL path
 *   3) body.id (last resort)
 *
 * WARNING: This version doesn't enforce authentication. Use admin auth (API key or session)
 * in production.
 */

const ALLOWED_PROVIDERS = [
  "royal-mail",
  "dpd",
  "evri",
  "ups",
  "dhl",
  "fedex",
  "parcelforce",
  "yodel",
] as const;
type Provider = typeof ALLOWED_PROVIDERS[number];

function actorFromRequest(req: NextRequest) {
  const adminName = req.headers.get("x-admin-name")?.trim();
  const adminHeader = req.headers.get("x-admin")?.trim();
  if (adminName) return adminName;
  if (adminHeader) return adminHeader;
  return "system";
}

function parseIdFromUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const match = url.pathname.match(/\/api\/orders\/([^/]+)\/shipment\/?$/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  } catch (e) {
    // ignore
  }
  return undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id?: string }> | { id?: string } }
) {
  try {
    // await params because Next.js 16+ may provide a Promise
    const resolvedParams = (params && typeof params === 'object' && params !== null && 'then' in params && typeof params.then === 'function')
      ? await params
      : (params as { id?: string });

    // parse body once
    const body = await req.json().catch(() => ({}));

    // resolve id: params -> url -> body.id
    const id = resolvedParams?.id || parseIdFromUrl(req.url) || (typeof body.id === "string" ? body.id : undefined);
    if (!id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const provider = typeof body.provider === "string" ? (body.provider as Provider) : undefined;
    const trackingCode = body.trackingCode ? String(body.trackingCode).trim() : undefined;
    const estimatedDeliveryRaw = body.estimatedDelivery ? String(body.estimatedDelivery).trim() : undefined;

    if (!provider || !ALLOWED_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json({ error: "Invalid or missing provider" }, { status: 400 });
    }

    let estimatedDelivery: string | null = null;
    if (estimatedDeliveryRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(estimatedDeliveryRaw)) {
        return NextResponse.json({ error: "estimatedDelivery must be YYYY-MM-DD" }, { status: 400 });
      }
      estimatedDelivery = new Date(estimatedDeliveryRaw + "T00:00:00Z").toISOString();
    }

    await dbConnect();

    const order = await Order.findById(id).exec();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const now = new Date();
    const actor = actorFromRequest(req);

    // build shipment history entry in metadata
    const meta: OrderMetadata = (order.metadata && typeof order.metadata === "object") ? { ...(order.metadata as Record<string, unknown>) } : {};
    const historyEntry: ShipmentHistoryEntry = {
      provider,
      trackingCode: trackingCode || null,
      estimatedDelivery,
      shippedAt: now.toISOString(),
      by: actor,
    };
    if (!Array.isArray(meta.shipmentHistory)) meta.shipmentHistory = [];
    meta.shipmentHistory.push(historyEntry);
    meta.lastShippedAt = now.toISOString();
    meta.lastShippedBy = actor;

    // update order shipment subdoc and status
    order.shipment = {
      provider,
      trackingCode: trackingCode || null,
      shippedAt: now,
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
    };

    if (order.status !== "refunded" && order.status !== "cancelled") {
      order.status = "shipped";
    }
    order.metadata = meta;

    await order.save();

    // Notify the customer using the helper (email read from the order)
    const notifyResult = await notifyShipmentToCustomer({
      order: order as unknown as OrderLike,
      provider,
      trackingCode: trackingCode || null,
      estimatedDelivery: estimatedDelivery ?? null,
    });

    let emailSent = false;
    let emailError: string | null = null;
    let emailInfo: unknown = null;

    if (notifyResult.sent) {
      emailSent = true;
      emailInfo = notifyResult.info;
    } else {
      emailSent = false;
      emailError = notifyResult.error ?? notifyResult.reason ?? "unknown";
      // Notify admins that the customer notification failed or was skipped
      try {
        await sendAdminNotification({
          orderId: order._id.toString(),
          orderNumber: String(order._id).slice(-8),
          total: (order.total as number) || 0,
          currency: (order.currency || "gbp").toUpperCase(),
          clientName:
            order.client?.name ||
            `${order.shippingAddress?.firstName || ""} ${order.shippingAddress?.lastName || ""}`.trim(),
          clientEmail:
            (order.shippingAddress && order.shippingAddress.email) ||
            (order.client && (order.client.email as string | undefined)) ||
            ((order as { billingAddress?: { email?: string } }).billingAddress?.email) ||
            "",
          items: order.items ? (order.items as unknown[]).map((it: unknown) => {
              const item = it as { name: string; qty: number; unitPrice: number; totalPrice: number };
              return {
                name: item.name,
                qty: item.qty,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
              };
            }) : [],
          dashboardUrl: process.env.ADMIN_DASHBOARD_URL
            ? `${process.env.ADMIN_DASHBOARD_URL.replace(/\/$/, "")}/orders/${order._id}`
            : undefined,
          metadata: { reason: "customer_notification_issue", notifyResult },
        });
      } catch (notifyErr) {
        console.warn("Failed to notify admin about customer notification issue", notifyErr);
      }
    }

    return NextResponse.json({
      ok: true,
      order,
      emailSent,
      emailError,
      emailInfo,
    });
  } catch (err) {
    console.error("Shipment route error:", err);
    const message = err instanceof Error ? err.message : "Failed to add shipment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}