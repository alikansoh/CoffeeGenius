import dbConnect from "@/lib/dbConnect";
import Order from "@/models/Order";
import { NextResponse } from "next/server";

interface OrderItem {
  name?: string;
  qty?: number;
}

interface OrderRefund {
  amount?: number;
}

interface OrderMetadata {
  refundedAmount?: number;
  refunds?: OrderRefund[];
}

interface OrderAddress {
  email?: string;
  firstName?: string;
  lastName?: string;
}

interface OrderShipment {
  provider?: string;
  trackingCode?: string;
}

interface OrderExport {
  _id: unknown;
  createdAt?: unknown;
  shippingAddress?: OrderAddress | null;
  billingAddress?: OrderAddress | null;
  status?: string;
  currency?: string;
  total?: number;
  metadata?: OrderMetadata | null;
  refund?: OrderRefund | null;
  shipment?: OrderShipment | null;
  items?: OrderItem[];
}

/**
 * GET /api/orders/export?format=csv
 *
 * Exports orders as CSV (Excel-friendly). Returns an attachment response.
 * - No authentication by default here — ensure you add auth middleware if required.
 */

function escapeCsv(value: unknown) {
  if (value === undefined || value === null) return "";
  const s = String(value);
  // if contains " or , or newline, wrap in quotes and escape quotes
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  try {
    await dbConnect();

    // Allow optional filters in future (e.g., status). For now, export all orders.
    const orders = await Order.find({}).lean().exec() as OrderExport[];

    // CSV headers
    const headers = [
      "orderId",
      "createdAt",
      "email",
      "name",
      "status",
      "currency",
      "total",
      "refundedTotal",
      "refundable",
      "shippingProvider",
      "trackingCode",
      "items",
    ];

    const rows = orders.map((o: OrderExport) => {
      const email =
        (o.shippingAddress && o.shippingAddress.email) ||
        (o.billingAddress && o.billingAddress.email) ||
        "";
      const name =
        (o.shippingAddress && [o.shippingAddress.firstName, o.shippingAddress.lastName].filter(Boolean).join(" ")) ||
        (o.billingAddress && [o.billingAddress.firstName, o.billingAddress.lastName].filter(Boolean).join(" ")) ||
        "";
      const refunded =
        (o.metadata && typeof o.metadata.refundedAmount === "number"
          ? o.metadata.refundedAmount
          : Array.isArray(o.metadata?.refunds)
          ? o.metadata.refunds.reduce((s: number, r: OrderRefund) => s + (Number(r?.amount) || 0), 0)
          : o.refund?.amount || 0) || 0;
      const refundable = Math.max(0, Number(((o.total || 0) - refunded).toFixed(2)));
      const shipmentProvider = o.shipment?.provider || "";
      const trackingCode = o.shipment?.trackingCode || "";
      const items = Array.isArray(o.items)
        ? o.items.map((it: OrderItem) => `${it.name || ''} x${it.qty || 0}`).join(" | ")
        : "";

      return [
        o._id,
        o.createdAt || "",
        email,
        name,
        o.status || "",
        (o.currency || "GBP").toUpperCase(),
        o.total ?? "",
        refunded,
        refundable,
        shipmentProvider,
        trackingCode,
        items,
      ].map(escapeCsv).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to export orders", err);
    return NextResponse.json({ error: "Failed to export orders" }, { status: 500 });
  }
}