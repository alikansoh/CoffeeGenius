import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import { processInvoice } from '@/lib/manualInvoiceService';
import { generateInvoicePDF, sendInvoiceEmail, InvoiceData, CompanyInfo } from '@/lib/manualInvoiceService';

// 🔐 تأكد من إضافة authentication middleware هنا
// import { verifyAdminAuth } from '@/lib/auth';

interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

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
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
}

interface RequestBody {
  client: ClientInput;
  items: InvoiceItemInput[];
  shipping?: number;
  notes?: string;
  dueDate?: string;
  sendEmail?: boolean;
  createdAt?: string;
  currency?: string;
  billingAddress?: {
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(Math.floor(Math.random() * 9000) + 1000); // 4-digit random suffix
  return `INV-${yyyy}-${yyyymmdd}-${suffix}`;
}

export async function POST(req: Request) {
  try {
    // const admin = await verifyAdminAuth(req);
    // if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const url = new URL(req.url);
    const wantPdf = url.searchParams.get('pdf') === 'true';

    const body: RequestBody = await req.json();
    const { client, items, shipping = 0, notes, dueDate, sendEmail = false } = body;

    // ✅ التحقق من البيانات
    if (!client?.name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one item is required' },
        { status: 400 }
      );
    }

    // If caller requested sending email, email must be present and valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (sendEmail && (!client?.email || !emailRegex.test(client.email))) {
      return NextResponse.json(
        { error: 'A valid client email is required to send the invoice' },
        { status: 400 }
      );
    }

    // ✅ حساب المبالغ
    const subtotal = items.reduce((sum: number, item: InvoiceItemInput) => {
      return sum + (item.qty * item.unitPrice);
    }, 0);

    const total = subtotal + shipping;

    // ✅ توليد رقم فاتورة (improved format)
    const invoiceNumber = generateInvoiceNumber();

    // use provided createdAt if present, otherwise set to now so PDF shows today's date by default
    const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();

    // ✅ إنشاء الفاتورة
    const invoice = await Invoice.create({
      source: 'manual',
      orderId: undefined,
      orderNumber: invoiceNumber,
      items: items.map((item: InvoiceItemInput) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        totalPrice: Number((item.qty * item.unitPrice).toFixed(2)),
      })),
      subtotal: Number(subtotal.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      total: Number(total.toFixed(2)),
      currency: (body.currency || 'gbp').toLowerCase(),
      client: {
        name: client.name,
        email: client.email || undefined,
        phone: client.phone || undefined,
      },
      shippingAddress: client.address || null,
      billingAddress: body.billingAddress ?? null,
      paymentIntentId: undefined,
      paymentStatus: 'unpaid',
      paidAt: null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdAt,
      notes: notes || undefined,
      recipientEmail: client.email || '',
      sender: {
        email: process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM,
        name: process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME,
      },
      metadata: {
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
      },
    });

    console.log(`✅ Manual invoice created: ${invoice._id.toString()}`);

    // Build invoice data object for PDF/email
    const invoiceData: InvoiceData = {
      orderId: invoice._id.toString(),
      orderNumber: invoiceNumber,
      items: invoice.items.map((it: InvoiceItem) => ({
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

    const companyInfo: CompanyInfo = {
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

    // If client asked for the PDF download, generate PDF now and return binary response.
    if (wantPdf) {
      try {
        const pdfBuffer = await generateInvoicePDF(invoiceData, companyInfo);

        // If sendEmail also requested, send using the already-generated PDF (background)
        if (sendEmail) {
          sendInvoiceEmail(invoiceData, Buffer.from(pdfBuffer))
            .then(async () => {
              await Invoice.findByIdAndUpdate(invoice._id, {
                sent: true,
                sentAt: new Date(),
              });
              console.log(`✉️ Manual invoice sent (background): ${invoice._id.toString()}`);
            })
            .catch(async (err: unknown) => {
              console.error('⚠️ Failed to send manual invoice (background):', err);
              await Invoice.findByIdAndUpdate(invoice._id, {
                sent: false,
                sendError: err instanceof Error ? err.message : String(err),
              });
            });
        }

        const uint8 = new Uint8Array(pdfBuffer);
        return new Response(uint8, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(uint8.length),
            'Content-Disposition': `attachment; filename=invoice-${invoiceNumber}.pdf`,
          },
        });
      } catch (pdfErr: unknown) {
        console.error('❌ Failed to generate PDF:', pdfErr);
        return NextResponse.json(
          { error: 'Invoice created but failed to generate PDF' },
          { status: 500 }
        );
      }
    }

    // If not requesting PDF, keep existing behavior:
    if (sendEmail) {
      processInvoice(invoiceData, companyInfo)
        .then(async () => {
          await Invoice.findByIdAndUpdate(invoice._id, {
            sent: true,
            sentAt: new Date(),
          });
          console.log(`✉️ Manual invoice sent: ${invoice._id.toString()}`);
        })
        .catch(async (err: unknown) => {
          console.error('⚠️ Failed to send manual invoice:', err);
          await Invoice.findByIdAndUpdate(invoice._id, {
            sent: false,
            sendError: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return NextResponse.json(
      {
        success: true,
        invoice: {
          id: invoice._id.toString(),
          orderNumber: invoiceNumber,
          total: invoice.total,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('❌ Error creating manual invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

// GET endpoint لجلب الفواتير
export async function GET(req: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source'); // 'manual' أو 'stripe'
    const status = searchParams.get('status'); // 'paid' أو 'unpaid'

    const query: Record<string, string> = {};
    if (source) query.source = source;
    if (status) query.paymentStatus = status;

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ invoices });

  } catch (error: unknown) {
    console.error('❌ Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}