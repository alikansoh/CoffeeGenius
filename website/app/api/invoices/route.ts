import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';
import Client from '@/models/Client';
import { getNextInvoiceNumber } from '@/lib/getNextInvoiceNumber';
import { processInvoice } from '@/lib/manualInvoiceService';
import { generateInvoicePDF, sendInvoiceEmail, InvoiceData, CompanyInfo } from '@/lib/manualInvoiceService';

// 🔐 Add authentication middleware here if needed
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
    firstName?: string;
    lastName?: string;
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
  const parts = (fullName || '').trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (sendEmail && (!client?.email || !emailRegex.test(client.email))) {
      return NextResponse.json(
        { error: 'A valid client email is required to send the invoice' },
        { status: 400 }
      );
    }

    const subtotal = items.reduce((sum: number, item: InvoiceItemInput) => {
      return sum + (item.qty * item.unitPrice);
    }, 0);

    const total = subtotal + shipping;
    const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();

    // ✅ Short sequential invoice number: INV-0001, INV-0002, ...
    const invoiceNumber = await getNextInvoiceNumber();

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

    console.log(`✅ Manual invoice created: ${invoice._id.toString()} (${invoiceNumber})`);

    // ✅ Upsert client in MongoDB
    try {
      const normalizedEmail = client.email ? client.email.toLowerCase().trim() : '';
      const normalizedPhone = client.phone ? client.phone.replace(/[^\d+]/g, '') : '';

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
            metadata: {
              source: 'invoice-creation',
              createdAt: new Date().toISOString(),
            },
          });
          console.log(`✅ New client saved from invoice: ${normalizedEmail}`);
        } else {
          await Client.findByIdAndUpdate(existingClient._id, {
            $set: {
              name: client.name.trim(),
              phone: normalizedPhone || existingClient.phone,
              address: {
                ...(existingClient.address || {}),
                ...address,
              },
              'metadata.updatedFromInvoice': new Date().toISOString(),
            },
          });
          console.log(`✅ Existing client updated from invoice: ${normalizedEmail}`);
        }
      } else if (normalizedPhone) {
        // If no email but phone exists, upsert by phone
        const existingClient = await Client.findOne({ phone: normalizedPhone }).lean();

        if (!existingClient) {
          await Client.create({
            name: client.name.trim(),
            phone: normalizedPhone,
            address,
            isSubscribed: false,
            metadata: {
              source: 'invoice-creation',
              createdAt: new Date().toISOString(),
            },
          });
          console.log(`✅ New client saved from invoice (by phone): ${normalizedPhone}`);
        } else {
          await Client.findByIdAndUpdate(existingClient._id, {
            $set: {
              name: client.name.trim(),
              address: {
                ...(existingClient.address || {}),
                ...address,
              },
              'metadata.updatedFromInvoice': new Date().toISOString(),
            },
          });
          console.log(`✅ Existing client updated from invoice (by phone): ${normalizedPhone}`);
        }
      }
    } catch (clientErr) {
      // Don't fail invoice creation if client upsert fails — just log it
      console.error('⚠️ Failed to upsert client from invoice:', clientErr);
    }

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

    if (wantPdf) {
      try {
        const pdfBuffer = await generateInvoicePDF(invoiceData, companyInfo);

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

export async function GET(req: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const status = searchParams.get('status');

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