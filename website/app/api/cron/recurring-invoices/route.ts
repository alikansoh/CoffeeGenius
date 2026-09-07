import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import { getNextInvoiceNumber } from '@/lib/getNextInvoiceNumber';
import { generateInvoicePDF, sendInvoiceEmail, InvoiceData, CompanyInfo } from '@/lib/manualInvoiceService';

const CRON_SECRET = process.env.CRON_SECRET;

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${CRON_SECRET}`;
}

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

/** Same calendar month + year as `now` — used so a template only ever generates once per
 *  month even if the cron runs more than once on the configured day. */
function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * GET /api/cron/recurring-invoices
 * Runs daily (see vercel.json). For every manual invoice with recurring.enabled=true whose
 * recurring.dayOfMonth matches today, and that hasn't already generated one this month, creates
 * a brand-new invoice — new number, fresh due date, unpaid — cloning the template's client/
 * items/shipping/notes, generates its PDF, and emails it, exactly like a manually-created one.
 */
export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const now = new Date();
    const today = now.getDate();

    const templates = await Invoice.find({
      source: 'manual',
      'recurring.enabled': true,
      'recurring.dayOfMonth': today,
    }).lean();

    const generated: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const template of templates) {
      const lastGeneratedAt = template.recurring?.lastGeneratedAt
        ? new Date(template.recurring.lastGeneratedAt)
        : null;

      if (lastGeneratedAt && isSameMonth(lastGeneratedAt, now)) {
        skipped.push(`${template.orderNumber}: already generated this month`);
        continue;
      }

      if (!template.client?.email) {
        errors.push(`${template.orderNumber}: template has no client email`);
        continue;
      }

      try {
        const invoiceNumber = await getNextInvoiceNumber();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 14);

        const newInvoice = await Invoice.create({
          source: 'manual',
          orderNumber: invoiceNumber,
          items: template.items,
          subtotal: template.subtotal,
          discount: template.discount,
          shipping: template.shipping,
          total: template.total,
          currency: template.currency,
          client: template.client,
          shippingAddress: template.shippingAddress,
          billingAddress: template.billingAddress,
          paymentStatus: 'unpaid',
          paidAt: null,
          dueDate,
          remindersEnabled: template.remindersEnabled ?? true,
          notes: template.notes,
          recipientEmail: template.client.email,
          sender: template.sender,
          recurringSourceId: template._id,
          metadata: {
            createdBy: 'recurring-invoice-cron',
            createdAt: now.toISOString(),
          },
        });

        const invoiceData: InvoiceData = {
          orderId: newInvoice._id.toString(),
          orderNumber: invoiceNumber,
          items: (newInvoice.items || []).map((it: { name: string; qty: number; unitPrice: number; totalPrice: number }) => ({
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
          subtotal: newInvoice.subtotal,
          shipping: newInvoice.shipping,
          total: newInvoice.total,
          client: {
            name: newInvoice.client?.name ?? '',
            email: newInvoice.client?.email ?? '',
            phone: newInvoice.client?.phone ?? undefined,
          },
          shippingAddress: newInvoice.shippingAddress ?? undefined,
          billingAddress: newInvoice.billingAddress ?? undefined,
          paidAt: undefined,
          dueDate: newInvoice.dueDate ?? undefined,
          createdAt: newInvoice.createdAt ?? undefined,
          paymentIntentId: null,
          currency: newInvoice.currency ?? 'gbp',
          notes: newInvoice.notes ?? undefined,
        };

        const pdfBuffer = await generateInvoicePDF(invoiceData, buildCompanyInfo());
        await sendInvoiceEmail(invoiceData, Buffer.from(pdfBuffer));

        await Invoice.findByIdAndUpdate(newInvoice._id, { $set: { sent: true, sentAt: new Date() } });
        await Invoice.findByIdAndUpdate(template._id, { $set: { 'recurring.lastGeneratedAt': now } });

        generated.push(invoiceNumber);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${template.orderNumber}: ${msg}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        checked: templates.length,
        generated,
        skipped,
        errors,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error running recurring-invoices cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to run recurring-invoices cron',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
