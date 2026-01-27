import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import WholesaleEnquiry from '@/models/WholeSaleEnquiry';
import { sendAdminNotification, sendCustomerConfirmation } from '@/lib/brevo';

type ReqBody = {
  business?: unknown;
  contact?: unknown;
  contactPref?: unknown;
  email?: unknown;
  phone?: unknown;
  interest?: unknown;
  message?: unknown;
};

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function sanitizeString(v: unknown): string | undefined {
  if (!isString(v)) return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}
export async function GET(req: Request) {
    try {
      await dbConnect();
    } catch (err) {
      console.error('DB connect failed:', err);
      return NextResponse.json({ meta: { total: 0, page: 1, limit: 25, totalPages: 0 }, data: [] }, { status: 200 });
    }
  
    try {
      const url = new URL(req.url);
      const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '25')));
      const q = (url.searchParams.get('q') ?? '').trim();
  
      const filter: Record<string, unknown> = {};
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { business: rx },
          { contact: rx },
          { email: rx },
          { phone: rx },
          { interest: rx },
          { message: rx },
        ];
      }
  
      const total = await WholesaleEnquiry.countDocuments(filter).exec();
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const skip = (page - 1) * limit;
  
      const docs = await WholesaleEnquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
  
      const data = (docs || []).map((d) => ({
        _id: d._id.toString(),
        business: d.business,
        contact: d.contact,
        email: d.email,
        phone: d.phone,
        interest: d.interest,
        message: d.message,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }));
  
      return NextResponse.json({
        meta: { total, page, limit, totalPages },
        data,
      }, { status: 200 });
    } catch (err) {
      console.error('Failed to list enquiries:', err);
      return NextResponse.json({ meta: { total: 0, page: 1, limit: 25, totalPages: 0 }, data: [] }, { status: 500 });
    }
  }

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    // server-side validation + sanitize
    const business = sanitizeString(body.business);
    const contact = sanitizeString(body.contact);
    const contactPref = sanitizeString(body.contactPref) === 'phone' ? 'phone' : 'email';
    const email = sanitizeString(body.email);
    const phone = sanitizeString(body.phone);
    const interest = sanitizeString(body.interest);
    const message = sanitizeString(body.message);

    const errors: Record<string, string> = {};
    if (!business) errors.business = 'Business name is required';
    if (!contact) errors.contact = 'Contact name is required';
    if (contactPref === 'email') {
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = 'A valid email is required';
    } else {
      if (!phone || phone.length < 6) errors.phone = 'A valid phone number is required';
    }

    if (Object.keys(errors).length) {
      return NextResponse.json(
        { ok: false, errors: Object.entries(errors).map(([field, message]) => ({ field, message })) },
        { status: 400 }
      );
    }

    await dbConnect();

    const created = await WholesaleEnquiry.create({
      business,
      contact,
      contactPref,
      email,
      phone,
      interest,
      message,
      status: 'new',
      metadata: {
        source: 'website-enquiry-api',
        createdAt: new Date().toISOString(),
      },
    });

    const enquiryId = created._id.toString();

    // Attempt to send admin notification + customer confirmation (don't fail request if email sending fails)
    (async () => {
      try {
        const dashboardUrl = process.env.ADMIN_DASHBOARD_URL
          ? `${process.env.ADMIN_DASHBOARD_URL.replace(/\/$/, '')}/wholesale/${enquiryId}`
          : undefined;

        await sendAdminNotification({
          enquiryId,
          clientName: contact ?? undefined,
          clientEmail: email ?? undefined,
          dashboardUrl,
          subject: `Wholesale enquiry: ${business} — ${contact}`,
          bodyHtml: `
            <div>
              <h2>New wholesale enquiry</h2>
              <p><strong>Business:</strong> ${business}</p>
              <p><strong>Contact:</strong> ${contact}</p>
              <p><strong>Contact preference:</strong> ${contactPref}</p>
              <p><strong>Email:</strong> ${email ?? '—'}</p>
              <p><strong>Phone:</strong> ${phone ?? '—'}</p>
              <p><strong>Interest:</strong> ${interest ?? '—'}</p>
              <p><strong>Message:</strong><br/>${message ? message.replace(/\n/g, '<br/>') : '—'}</p>
              ${dashboardUrl ? `<p><a href="${dashboardUrl}">Open in admin</a></p>` : ''}
            </div>
          `,
        });
      } catch (adminErr) {
        console.error('sendAdminNotification failed (non-fatal):', adminErr);
      }

      try {
        if (email) {
          await sendCustomerConfirmation({ to: email, business: business ?? '', contact: contact ?? '', interest: interest ?? undefined, enquiryId });
        }
      } catch (custErr) {
        console.warn('sendCustomerConfirmation failed (non-fatal):', custErr);
      }
    })();

    return NextResponse.json({ ok: true, enquiryId }, { status: 201 });
  } catch (err) {
    console.error('api/enquiry POST error:', err);
    return NextResponse.json({ ok: false, message: 'Server error' }, { status: 500 });
  }
}