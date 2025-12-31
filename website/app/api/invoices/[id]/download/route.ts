import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Invoice from "@/models/Invoice";
import { generateInvoicePDF, InvoiceData, CompanyInfo } from "@/lib/manualInvoiceService";

interface InvoiceDoc {
  _id?: string;
  orderNumber: string;
  items: {
    name: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  subtotal: number;
  shipping: number;
  total: number;
  client: {
    name: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  billingAddress?: {
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  paidAt?: Date;
  dueDate?: Date;
  createdAt?: Date;
  paymentIntentId?: string;
  currency?: string;
  notes?: string;
}

export async function GET(req: Request) {
  try {
    // Parse the id from the request URL path: /api/invoices/{id}/download
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean); // filter removes empty strings
    // segments example: ["api","invoices","{id}","download"]
    const id = segments.length >= 3 ? segments[segments.length - 2] : null;

    if (!id) {
      return NextResponse.json({ error: "Missing invoice id in path" }, { status: 400 });
    }

    await dbConnect();

    const invoiceDoc: InvoiceDoc = await Invoice.findById(id).lean();
    if (!invoiceDoc) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Build InvoiceData expected by generateInvoicePDF
    const invoiceForPdf: InvoiceData = {
      orderId: invoiceDoc._id?.toString(),
      orderNumber: invoiceDoc.orderNumber,
      items: (invoiceDoc.items || []).map((it) => ({
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
      })),
      subtotal: invoiceDoc.subtotal,
      shipping: invoiceDoc.shipping,
      total: invoiceDoc.total,
      client: {
        name: invoiceDoc.client?.name ?? "",
        email: invoiceDoc.client?.email ?? "",
        phone: invoiceDoc.client?.phone ?? undefined,
      },
      shippingAddress: invoiceDoc.shippingAddress ?? undefined,
      billingAddress: invoiceDoc.billingAddress ?? undefined,
      paidAt: invoiceDoc.paidAt ?? undefined,
      dueDate: invoiceDoc.dueDate ?? undefined,
      createdAt: invoiceDoc.createdAt ?? undefined,
      paymentIntentId: invoiceDoc.paymentIntentId ?? null,
      currency: invoiceDoc.currency ?? "gbp",
      notes: invoiceDoc.notes ?? undefined,
    };

    const company: CompanyInfo = {
      name: process.env.COMPANY_NAME || "Your Company",
      address: process.env.COMPANY_ADDRESS || "",
      city: process.env.COMPANY_CITY || "",
      postcode: process.env.COMPANY_POSTCODE || "",
      country: process.env.COMPANY_COUNTRY || "United Kingdom",
      email: process.env.COMPANY_EMAIL || "",
      phone: process.env.COMPANY_PHONE,
      vatNumber: process.env.COMPANY_VAT_NUMBER,
      website: process.env.COMPANY_WEBSITE,
      logoPath: process.env.COMPANY_LOGO_PATH,
    };

    const pdfBuffer = await generateInvoicePDF(invoiceForPdf, company);

    const uint8 = new Uint8Array(pdfBuffer);
    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${invoiceDoc.orderNumber || id}.pdf`,
        "Content-Length": String(uint8.length),
      },
    });
  } catch (err: unknown) {
    console.error("Failed to generate/download invoice PDF:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate PDF" }, { status: 500 });
  }
}