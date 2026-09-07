import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import { sendInvoiceReminderEmail } from '@/lib/invoiceReminderService';
import { generateInvoicePDF, InvoiceData, CompanyInfo } from '@/lib/manualInvoiceService';

const CRON_SECRET = process.env.CRON_SECRET;

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

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (!isCronAuthorized(req)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const now = new Date();

    const invoices = await Invoice.find({
      source: 'manual',
      paymentStatus: { $ne: 'paid' },
      dueDate: { $exists: true, $ne: null },
      // $ne: false (not $eq: true) so invoices from before this field existed — where it's
      // undefined — still get reminded, matching the schema default of true.
      remindersEnabled: { $ne: false },
    }).lean();

    const remindersSent: string[] = [];
    const errors: string[] = [];
    const companyInfo = buildCompanyInfo();

    for (const invoice of invoices) {
      if (!invoice.dueDate) continue;

      const dueDate = new Date(invoice.dueDate);
      const diffMs = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 2) continue;

      const lastReminder = invoice.metadata?.lastReminderAt
        ? new Date(invoice.metadata.lastReminderAt as string)
        : null;

      const hoursSinceLastReminder = lastReminder
        ? (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (hoursSinceLastReminder < 40) continue;

      if (!invoice.client?.email) {
        errors.push(`${invoice.orderNumber}: missing client email`);
        continue;
      }

      try {
        // Attach the invoice PDF — best-effort: a PDF-generation hiccup shouldn't stop the
        // reminder text itself from going out for this invoice.
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
          pdfBuffer = await generateInvoicePDF(invoiceForPdf, companyInfo);
        } catch (pdfErr) {
          console.error(`⚠️ Failed to generate invoice PDF for reminder (${invoice.orderNumber}):`, pdfErr);
        }

        await sendInvoiceReminderEmail({
          orderNumber: invoice.orderNumber,
          total: invoice.total,
          currency: invoice.currency,
          clientName: invoice.client.name || '',
          clientEmail: invoice.client.email,
          dueDate,
          pdfBuffer,
        });

        await Invoice.findByIdAndUpdate(invoice._id, {
          $set: {
            'metadata.lastReminderAt': now.toISOString(),
          },
        });

        remindersSent.push(invoice.orderNumber);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${invoice.orderNumber}: ${msg}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        checked: invoices.length,
        remindersSent,
        errors,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error running invoice reminder cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to run invoice reminder cron',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}