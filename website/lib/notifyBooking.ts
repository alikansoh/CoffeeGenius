/**
 * lib/notifyBooking.ts
 *
 * Sends a clean monochrome booking confirmation email to the customer using Brevo.
 *
 * Required env vars:
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (or EMAIL_FROM)
 * Optional:
 * - BREVO_SENDER_NAME
 * - COMPANY_NAME
 * - SUPPORT_EMAIL
 * - APP_BASE_URL
 */

import type mongoose from "mongoose";

type BookingLike = {
  _id?: mongoose.Types.ObjectId | string;
  bookingRef?: string;
  courseId?: string | mongoose.Types.ObjectId;
  courseTitle?: string;
  sessionStart?: string | Date | null;
  sessionEnd?: string | Date | null;
  name?: string;
  email?: string;
  phone?: string;
  attendees?: number;
  createdAt?: string | Date;
};

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type SendResult =
  | { sent: true; info: Record<string, unknown> }
  | { sent: false; error?: string; reason?: "no-recipient" | "send-failed" };

function fmtDate(d?: string | Date | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(d);
  }
}

export async function notifyBookingToCustomer(opts: {
  booking: BookingLike;
  appBase?: string | null;
}): Promise<SendResult> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "").trim();
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Your Store";
  const supportEmail = process.env.SUPPORT_EMAIL || senderEmail || "";
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const companyName = process.env.COMPANY_NAME || senderName || "Store";

  if (!brevoApiKey) {
    return { sent: false, error: "BREVO_API_KEY not configured", reason: "send-failed" };
  }
  if (!senderEmail) {
    return { sent: false, error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured", reason: "send-failed" };
  }

  const recipient = opts.booking.email || "";
  if (!recipient) {
    return { sent: false, error: "No recipient email on booking", reason: "no-recipient" };
  }

  const ref = escapeHtml(opts.booking.bookingRef || String(opts.booking._id || "").slice(-8));
  const courseTitle = escapeHtml(opts.booking.courseTitle || "Your class");
  const attendeeLine = `${opts.booking.attendees ?? 1} ${opts.booking.attendees === 1 ? "person" : "people"}`;
  const sessionLine = opts.booking.sessionStart ? fmtDate(opts.booking.sessionStart) + (opts.booking.sessionEnd ? ` — ${fmtDate(opts.booking.sessionEnd)}` : "") : "TBD";

  const html = `<!doctype html>
  <html>
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#000;background:#fff;">
    <div style="max-width:600px;margin:0 auto;padding:20px">
      <div style="border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:20px;">
        <h1 style="margin:0;font-size:20px;font-weight:600;">${escapeHtml(companyName)}</h1>
      </div>

      <h2 style="font-size:18px;margin:0 0 12px;">Booking confirmed — ${ref}</h2>

      <p style="margin:0 0 12px;">Hi ${escapeHtml(opts.booking.name || "") || "there"},</p>

      <p style="margin:0 0 12px;">
        Thank you — your booking for <strong>${courseTitle}</strong> is confirmed.
        Booking reference: <strong>${ref}</strong>.
      </p>

      <div style="margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:6px;background:#fafafa">
        <div style="font-weight:600;margin-bottom:8px;">Booking details</div>
        <div style="font-size:14px;margin-bottom:6px;"><strong>Session:</strong> ${escapeHtml(sessionLine)}</div>
        <div style="font-size:14px;margin-bottom:6px;"><strong>Attendees:</strong> ${escapeHtml(attendeeLine)}</div>
        <div style="font-size:14px;"><strong>Contact:</strong> ${escapeHtml(opts.booking.phone || "")} — ${escapeHtml(opts.booking.email || recipient)}</div>
      </div>

      ${appBase ? `<p style="margin:12px 0 0;">Manage your booking: <a href="${appBase}/bookings/${encodeURIComponent(String(opts.booking._id || ""))}" style="color:#000;">View booking</a></p>` : ""}

      <p style="margin:20px 0 0;color:#666;">If you have any questions, reply to this email or contact ${escapeHtml(supportEmail)}.</p>

      <div style="border-top:1px solid #ddd;padding-top:12px;margin-top:18px;font-size:12px;color:#999;text-align:center">
        © ${new Date().getFullYear()} ${escapeHtml(companyName)}
      </div>
    </div>
  </body>
  </html>`;

  const textLines = [
    `${companyName} — Booking confirmation ${ref}`,
    "",
    `Hello ${opts.booking.name || ""},`,
    "",
    `Your booking for ${opts.booking.courseTitle || "your class"} is confirmed.`,
    `Reference: ${ref}`,
    `Session: ${sessionLine}`,
    `Attendees: ${attendeeLine}`,
    `Contact: ${opts.booking.phone || ""} • ${recipient}`,
    appBase ? `Manage your booking: ${appBase}/bookings/${String(opts.booking._id || "")}` : "",
    "",
    `Questions? ${supportEmail}`,
    "",
    `Thanks — ${companyName}`,
  ].filter(Boolean);

  const text = textLines.join("\n");

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: recipient }],
    subject: `${companyName} — Booking ${ref} confirmed`,
    htmlContent: html,
    textContent: text,
  };

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { sent: false, error: `Brevo error ${resp.status}: ${txt}`, reason: "send-failed" };
    }

    const info = await resp.json().catch(() => ({}));
    return { sent: true, info };
  } catch (err: unknown) {
    return { sent: false, error: err instanceof Error ? err.message : String(err), reason: "send-failed" };
  }
}