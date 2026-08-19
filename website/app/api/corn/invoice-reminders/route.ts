import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import { sendInvoiceReminderEmail } from '@/lib/invoiceReminderService';

const CRON_SECRET = process.env.CRON_SECRET;

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
    }).lean();

    const remindersSent: string[] = [];
    const errors: string[] = [];

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
        await sendInvoiceReminderEmail({
          orderNumber: invoice.orderNumber,
          total: invoice.total,
          currency: invoice.currency,
          clientName: invoice.client.name || '',
          clientEmail: invoice.client.email,
          dueDate,
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