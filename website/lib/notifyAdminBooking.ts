/**
 * lib/notifyAdminBooking.ts
 *
 * Sends a short admin notification email about a new booking using Brevo.
 *
 * Required env vars:
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (or EMAIL_FROM)
 * - ADMIN_NOTIFICATION_EMAIL OR ADMIN_EMAIL OR SUPPORT_EMAIL  <- destination for admin notifications
 *
 * Optional:
 * - BREVO_SENDER_NAME
 * - COMPANY_NAME
 *
 * This version uses multiple fallbacks for the admin recipient so it will
 * pick up ADMIN_NOTIFICATION_EMAIL if that's what you named it in your env.
 */

import type mongoose from "mongoose";

export type BookingSummary = {
  _id?: mongoose.Types.ObjectId | string;
  bookingRef?: string;
  courseTitle?: string;
  sessionStart?: string | Date | null;
  sessionEnd?: string | Date | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  attendees?: number | null;
  createdAt?: string | Date | null;
};

function safe(s?: unknown): string {
  if (s === undefined || s === null) return "";
  return String(s);
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

export async function notifyAdminBooking(
  opts: { booking: BookingSummary }
): Promise<{ sent: true } | { sent: false; error: string }> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "").trim();
  // Accept a number of env names (ADMIN_NOTIFICATION_EMAIL is checked first)
  const adminEmail =
    (process.env.ADMIN_NOTIFICATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      process.env.BREVO_SENDER_EMAIL ||
      "")
      .trim();
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Your Store";
  const companyName = process.env.COMPANY_NAME || senderName || "Store";

  if (!brevoApiKey) return { sent: false, error: "BREVO_API_KEY not configured" };
  if (!senderEmail) return { sent: false, error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured" };
  if (!adminEmail) return { sent: false, error: "ADMIN notification email not configured (ADMIN_NOTIFICATION_EMAIL/ADMIN_EMAIL/SUPPORT_EMAIL missing)" };

  const b = opts.booking;
  const sessionLine = b.sessionStart ? `${fmtDate(b.sessionStart)}${b.sessionEnd ? ` — ${fmtDate(b.sessionEnd)}` : ""}` : "TBD";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#000;">
      <h2 style="margin:0 0 8px;">New Booking: ${safe(b.bookingRef)}</h2>
      <div style="margin-bottom:6px;"><strong>Course:</strong> ${safe(b.courseTitle)}</div>
      <div style="margin-bottom:6px;"><strong>Session:</strong> ${sessionLine}</div>
      <div style="margin-bottom:6px;"><strong>Attendees:</strong> ${safe(b.attendees)}</div>
      <div style="margin-bottom:6px;"><strong>Name:</strong> ${safe(b.name)}</div>
      <div style="margin-bottom:6px;"><strong>Email:</strong> ${safe(b.email)}</div>
      <div style="margin-bottom:6px;"><strong>Phone:</strong> ${safe(b.phone)}</div>
      <div style="margin-top:12px;color:#666;font-size:13px;">Received: ${fmtDate(b.createdAt)}</div>
      <div style="margin-top:18px;border-top:1px solid #eee;padding-top:8px;font-size:12px;color:#666;">${companyName}</div>
    </div>
  `;

  const text = [
    `New booking ${safe(b.bookingRef)}`,
    `Course: ${safe(b.courseTitle)}`,
    `Session: ${sessionLine}`,
    `Attendees: ${safe(b.attendees)}`,
    `Name: ${safe(b.name)}`,
    `Email: ${safe(b.email)}`,
    `Phone: ${safe(b.phone)}`,
    `Received: ${fmtDate(b.createdAt)}`,
  ].join("\n");

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: adminEmail }],
    subject: `New booking ${safe(b.bookingRef)} — ${safe(b.courseTitle)}`,
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
      return { sent: false, error: `Brevo API ${resp.status}: ${txt}` };
    }

    return { sent: true };
  } catch (err: unknown) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}