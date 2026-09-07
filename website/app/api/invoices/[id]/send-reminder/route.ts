import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import { sendInvoiceReminderEmail } from '@/lib/invoiceReminderService';
import { generateInvoicePDF, InvoiceData, CompanyInfo } from '@/lib/manualInvoiceService';

function buildCompanyInfo(): CompanyInfo {
  return {
    name: process.env.COMPANY_NAME || 'Your Company',
    address: process.env.COMPANY_ADDRESS || '',
    city: process.env.COMPANY_CITY || '',
    postcode: process.env.COMPANY_POSTCODE || '',
    country: process.env.COMPANY_COUNTRY || 'United Kingdom',
    email: process.env.COMPANY_EMAIL || '',
    phone: process.env.COMPANY_PHONE,
    vatNumber: process.env.COMPANY_VAT_NUMBER,
    website: process.env.COMPANY_WEBSITE,
    logoPath: process.env.COMPANY_LOGO_PATH,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID format' },
        { status: 400 }
      );
    }

    await dbConnect();

    const invoice = await Invoice.findById(id).lean();

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (invoice.source !== 'manual') {
      return NextResponse.json(
        { error: 'Only manual invoices can send reminders' },
        { status: 403 }
      );
    }

    if (invoice.paymentStatus === 'paid') {
      return NextResponse.json(
        { error: 'Invoice is already paid' },
        { status: 400 }
      );
    }

    if (!invoice.client?.email) {
      return NextResponse.json(
        { error: 'Invoice has no client email' },
        { status: 400 }
      );
    }

    if (!invoice.dueDate) {
      return NextResponse.json(
        { error: 'Invoice has no due date' },
        { status: 400 }
      );
    }

    // Attach the invoice PDF — best-effort: a PDF-generation hiccup shouldn't block the
    // reminder text itself from going out.
    let pdfBuffer: Buffer | undefined;
    try {
      const invoiceForPdf: InvoiceData = {
        orderId: invoice._id?.toString(),
        orderNumber: invoice.orderNumber,
        items: (invoice.items || []).map((it: { name: string; qty: number; unitPrice: number; totalPrice: number }) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
        subtotal: invoice.subtotal,
        shipping: invoice.shipping,
        total: invoice.total,
        client: {
          name: invoice.client?.name ?? '',
          email: invoice.client?.email ?? '',
          phone: invoice.client?.phone ?? undefined,
        },
        shippingAddress: invoice.shippingAddress ?? undefined,
        billingAddress: invoice.billingAddress ?? undefined,
        paidAt: invoice.paidAt ?? undefined,
        dueDate: invoice.dueDate ?? undefined,
        createdAt: invoice.createdAt ?? undefined,
        paymentIntentId: invoice.paymentIntentId ?? null,
        currency: invoice.currency ?? 'gbp',
        notes: invoice.notes ?? undefined,
      };
      pdfBuffer = await generateInvoicePDF(invoiceForPdf, buildCompanyInfo());
    } catch (pdfErr) {
      console.error('⚠️ Failed to generate invoice PDF for reminder (sending without attachment):', pdfErr);
    }

    await sendInvoiceReminderEmail({
      orderNumber: invoice.orderNumber,
      total: invoice.total,
      currency: invoice.currency,
      clientName: invoice.client.name || '',
      clientEmail: invoice.client.email,
      dueDate: new Date(invoice.dueDate),
      pdfBuffer,
    });

    await Invoice.findByIdAndUpdate(id, {
      $set: {
        'metadata.lastReminderAt': new Date().toISOString(),
      },
    });

    console.log(`✅ Manual reminder sent for invoice ${invoice.orderNumber}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Reminder sent successfully',
        orderNumber: invoice.orderNumber,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error sending reminder:', error);
    return NextResponse.json(
      {
        error: 'Failed to send reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}