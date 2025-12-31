'use server';
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';

/**
 * Next.js route handler for PATCH /api/invoices/[id]/mark-paid
 *
 * Note: In Next.js route handlers the `context.params` may be a plain object
 * or a Promise that resolves to the params object depending on version/runtime.
 * Awaiting `context.params` works in both cases.
 */
export async function PATCH(
  req: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    // Ensure DB connection
    await dbConnect();

    // context.params can be a promise or an object; awaiting is safe in both cases
    const resolvedParams = (await context.params) as { id: string };
    const id = resolvedParams.id;

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only allow marking invoices created manually as paid
    if (invoice.source !== 'manual') {
      return NextResponse.json(
        { error: 'Cannot manually mark Stripe invoices as paid' },
        { status: 400 }
      );
    }

    invoice.paymentStatus = 'paid';
    invoice.paidAt = new Date();
    await invoice.save();

    console.log(`✅ Invoice ${id} marked as paid`);

    return NextResponse.json(
      {
        success: true,
        invoice: {
          id: invoice._id.toString(),
          paymentStatus: invoice.paymentStatus,
          paidAt: invoice.paidAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error marking invoice as paid:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}