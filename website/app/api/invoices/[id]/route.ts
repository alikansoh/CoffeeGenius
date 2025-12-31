import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Invoice from "@/models/Invoice";

/**
 * PATCH /api/invoices/: id
 * Mark an invoice as paid
 */
export async function PATCH(
  req: NextRequest,
  { params }:  { params: Promise<{ id: string }> }
) {
  try {
    // TODO: Add authentication check here
    // const admin = await verifyAdminAuth(req);
    // if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Validate MongoDB ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    // Connect to database
    await dbConnect();

    // Find the invoice
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Check if already paid
    if (invoice.paymentStatus === "paid") {
      return NextResponse.json(
        { 
          error: "Invoice is already marked as paid",
          invoice 
        },
        { status: 400 }
      );
    }

    // Update invoice status
    invoice.paymentStatus = "paid";
    invoice.paidAt = new Date();
    await invoice.save();

    console.log(`✅ Invoice marked as paid: ${invoice._id.toString()}`);

    return NextResponse.json(
      {
        success: true,
        message:  "Invoice marked as paid successfully",
        invoice: {
          id:  invoice._id.toString(),
          orderNumber: invoice.orderNumber,
          paymentStatus: invoice. paymentStatus,
          paidAt: invoice.paidAt,
          total: invoice.total,
        },
      },
      { status:  200 }
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
    // TODO: Add authentication check here
    // const admin = await verifyAdminAuth(req);
    // if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Validate MongoDB ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    // Connect to database
    await dbConnect();

    // Find the invoice first to check if it exists
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status:  404 }
      );
    }

    // Optional:  Prevent deletion of paid invoices (business logic)
    // Uncomment if you want to restrict deletion of paid invoices
    /*
    if (invoice.paymentStatus === "paid") {
      return NextResponse.json(
        { 
          error: "Cannot delete paid invoices.  Please contact support.",
          invoice: {
            id: invoice._id. toString(),
            orderNumber: invoice.orderNumber,
            paymentStatus: invoice.paymentStatus,
          }
        },
        { status: 403 }
      );
    }
    */

    // Store invoice details before deletion for response
    const deletedInvoiceInfo = {
      id: invoice._id.toString(),
      orderNumber: invoice.orderNumber,
      clientName: invoice. client?.name,
      total: invoice.total,
      paymentStatus: invoice.paymentStatus,
    };

    // Delete the invoice
    await Invoice.findByIdAndDelete(id);

    console.log(`🗑️ Invoice deleted: ${deletedInvoiceInfo.orderNumber} (${id})`);

    return NextResponse.json(
      {
        success: true,
        message:  "Invoice deleted successfully",
        deletedInvoice: deletedInvoiceInfo,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Error deleting invoice:", error);
    return NextResponse.json(
      {
        error:  "Failed to delete invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
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

    // Validate MongoDB ObjectId format
    if (! id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: "Invalid invoice ID format" },
        { status: 400 }
      );
    }

    // Connect to database
    await dbConnect();

    // Find the invoice
    const invoice = await Invoice.findById(id).lean();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status:  404 }
      );
    }

    return NextResponse. json(
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