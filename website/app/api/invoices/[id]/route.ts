import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { processInvoice, generateInvoicePDF } from "@/lib/manualInvoiceService";
import { InvoiceData, CompanyInfo } from "@/lib/manualInvoiceService";

interface InvoiceItemInput {
  name: string;
  qty: number;
  unitPrice: number;
}

interface ClientInput {
  name: string;
  email?: string;
  phone?: string;
  address?: {
    firstName?: string;
    lastName?: string;
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
}

interface UpdateRequestBody {
  client: ClientInput;
  items: InvoiceItemInput[];
  shipping?: number;
  notes?: string;
  dueDate?: string;
  remindersEnabled?: boolean;
  recurring?: { enabled: boolean; dayOfMonth?: number };
  sendEmail?: boolean;
  createdAt?: string;
  currency?: string;
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
}

function splitName(fullName: string) {
  const parts = (fullName || "").trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

/**
 * GET /api/invoices/:id
 * Get a single invoice by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const invoice = await Invoice.findById(id).lean();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        invoice,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Error fetching invoice:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/invoices/:id
 * Update a manual invoice
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const url = new URL(req.url);
    const wantPdf = url.searchParams.get("pdf") === "true";

    const existing = await Invoice.findById(id).lean();

    if (!existing) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (existing.source !== "manual") {
      return NextResponse.json(
        { error: "Only manual invoices can be edited" },
        { status: 403 }
      );
    }

    const body: UpdateRequestBody = await req.json();
    const { client, items, shipping = 0, notes, dueDate, remindersEnabled = true, recurring, sendEmail = false } = body;

    if (recurring?.enabled && (!recurring.dayOfMonth || recurring.dayOfMonth < 1 || recurring.dayOfMonth > 28)) {
      return NextResponse.json(
        { error: "Recurring day of month must be between 1 and 28" },
        { status: 400 }
      );
    }

    if (!client?.name) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (sendEmail && (!client?.email || !emailRegex.test(client.email))) {
      return NextResponse.json(
        { error: "A valid client email is required to send the invoice" },
        { status: 400 }
      );
    }

    const subtotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const total = subtotal + shipping;
    const createdAt = body.createdAt ? new Date(body.createdAt) : existing.createdAt;

    const updated = await Invoice.findByIdAndUpdate(
      id,
      {
        $set: {
          items: items.map((item) => ({
            name: item.name,
            qty: item.qty,
            unitPrice: item.unitPrice,
            totalPrice: Number((item.qty * item.unitPrice).toFixed(2)),
          })),
          subtotal: Number(subtotal.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(total.toFixed(2)),
          currency: (body.currency || "gbp").toLowerCase(),
          client: {
            name: client.name,
            email: client.email || undefined,
            phone: client.phone || undefined,
          },
          shippingAddress: client.address || null,
          billingAddress: body.billingAddress ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
          remindersEnabled,
          // Preserve lastGeneratedAt — only the recurring cron itself should ever touch that,
          // so re-saving the form (even toggling enabled on/off) can't cause a double-send.
          recurring: recurring?.enabled
            ? {
                enabled: true,
                dayOfMonth: recurring.dayOfMonth,
                lastGeneratedAt: existing.recurring?.lastGeneratedAt,
              }
            : { enabled: false, lastGeneratedAt: existing.recurring?.lastGeneratedAt },
          createdAt,
          notes: notes || undefined,
          recipientEmail: client.email || "",
          "metadata.updatedAt": new Date().toISOString(),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update invoice" },
        { status: 500 }
      );
    }

    // ✅ Upsert client
    try {
      const normalizedEmail = client.email ? client.email.toLowerCase().trim() : "";
      const normalizedPhone = client.phone ? client.phone.replace(/[^\d+]/g, "") : "";

      const nameParts = splitName(client.name);
      const billing = body.billingAddress || {};

      const address = {
        firstName: billing.firstName || nameParts.firstName,
        lastName: billing.lastName || nameParts.lastName,
        line1: billing.line1 || client.address?.line1 || undefined,
        unit: billing.unit || client.address?.unit || undefined,
        city: billing.city || client.address?.city || undefined,
        postcode: billing.postcode || client.address?.postcode || undefined,
        country: billing.country || client.address?.country || undefined,
        email: normalizedEmail || undefined,
        phone: normalizedPhone || undefined,
      };

      if (normalizedEmail) {
        const existingClient = await Client.findOne({ email: normalizedEmail }).lean();
        if (!existingClient) {
          await Client.create({
            name: client.name.trim(),
            email: normalizedEmail,
            phone: normalizedPhone || undefined,
            address,
            isSubscribed: false,
            metadata: { source: "invoice-edit", createdAt: new Date().toISOString() },
          });
        } else {
          await Client.findByIdAndUpdate(existingClient._id, {
            $set: {
              name: client.name.trim(),
              phone: normalizedPhone || existingClient.phone,
              address: { ...(existingClient.address || {}), ...address },
              "metadata.updatedFromInvoiceEdit": new Date().toISOString(),
            },
          });
        }
      } else if (normalizedPhone) {
        const existingClient = await Client.findOne({ phone: normalizedPhone }).lean();
        if (!existingClient) {
          await Client.create({
            name: client.name.trim(),
            phone: normalizedPhone,
            address,
            isSubscribed: false,
            metadata: { source: "invoice-edit", createdAt: new Date().toISOString() },
          });
        } else {
          await Client.findByIdAndUpdate(existingClient._id, {
            $set: {
              name: client.name.trim(),
              address: { ...(existingClient.address || {}), ...address },
              "metadata.updatedFromInvoiceEdit": new Date().toISOString(),
            },
          });
        }
      }
    } catch (clientErr) {
      console.error("⚠️ Failed to upsert client from invoice edit:", clientErr);
    }

    // Build invoice data for PDF/email
    const invoiceData: InvoiceData = {
      orderId: updated._id.toString(),
      orderNumber: updated.orderNumber,
      items: updated.items.map((it: { name: string; qty: number; unitPrice: number; totalPrice: number }) => ({
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
      })),
      subtotal: updated.subtotal,
      shipping: updated.shipping,
      total: updated.total,
      client: {
        name: updated.client?.name ?? "",
        email: updated.client?.email ?? "",
        phone: updated.client?.phone ?? undefined,
      },
      shippingAddress: updated.shippingAddress ?? undefined,
      billingAddress: updated.billingAddress ?? undefined,
      paidAt: updated.paidAt ?? undefined,
      dueDate: updated.dueDate ?? undefined,
      createdAt: updated.createdAt ?? undefined,
      paymentIntentId: updated.paymentIntentId ?? null,
      currency: updated.currency ?? "gbp",
      notes: updated.notes ?? undefined,
    };

    const companyInfo: CompanyInfo = {
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

    // ✅ Return PDF if requested
    if (wantPdf) {
      try {
        const pdfBuffer = await generateInvoicePDF(invoiceData, companyInfo);

        const uint8 = new Uint8Array(pdfBuffer);
        return new Response(uint8, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(uint8.length),
            "Content-Disposition": `attachment; filename=invoice-${updated.orderNumber}.pdf`,
          },
        });
      } catch (pdfErr: unknown) {
        console.error("❌ Failed to generate PDF after update:", pdfErr);
        return NextResponse.json(
          { error: "Invoice updated but failed to generate PDF" },
          { status: 500 }
        );
      }
    }

    // ✅ Resend email if requested
    if (sendEmail) {
      processInvoice(invoiceData, companyInfo)
        .then(async () => {
          await Invoice.findByIdAndUpdate(id, { $set: { sent: true, sentAt: new Date() } });
          console.log(`✉️ Updated invoice sent: ${id}`);
        })
        .catch(async (err: unknown) => {
          console.error("⚠️ Failed to send updated invoice:", err);
          await Invoice.findByIdAndUpdate(id, {
            $set: {
              sent: false,
              sendError: err instanceof Error ? err.message : String(err),
            },
          });
        });
    }

    return NextResponse.json(
      {
        success: true,
        invoice: {
          id: updated._id.toString(),
          orderNumber: updated.orderNumber,
          total: updated.total,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Error updating invoice:", error);
    return NextResponse.json(
      {
        error: "Failed to update invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/invoices/:id
 * Mark an invoice as paid
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.paymentStatus === "paid") {
      return NextResponse.json(
        {
          error: "Invoice is already marked as paid",
          invoice,
        },
        { status: 400 }
      );
    }

    invoice.paymentStatus = "paid";
    invoice.paidAt = new Date();
    await invoice.save();

    console.log(`✅ Invoice marked as paid: ${invoice._id.toString()}`);

    return NextResponse.json(
      {
        success: true,
        message: "Invoice marked as paid successfully",
        invoice: {
          id: invoice._id.toString(),
          orderNumber: invoice.orderNumber,
          paymentStatus: invoice.paymentStatus,
          paidAt: invoice.paidAt,
          total: invoice.total,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Error updating invoice:", error);
    return NextResponse.json(
      {
        error: "Failed to update invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invoices/:id
 * Delete an invoice
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const deletedInvoiceInfo = {
      id: invoice._id.toString(),
      orderNumber: invoice.orderNumber,
      clientName: invoice.client?.name,
      total: invoice.total,
      paymentStatus: invoice.paymentStatus,
    };

    await Invoice.findByIdAndDelete(id);

    console.log(`🗑️ Invoice deleted: ${deletedInvoiceInfo.orderNumber} (${id})`);

    return NextResponse.json(
      {
        success: true,
        message: "Invoice deleted successfully",
        deletedInvoice: deletedInvoiceInfo,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Error deleting invoice:", error);
    return NextResponse.json(
      {
        error: "Failed to delete invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}