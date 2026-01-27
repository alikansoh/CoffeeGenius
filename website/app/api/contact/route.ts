import { NextResponse } from "next/server";

type ContactPayload = {
  name?: string;
  email?: string;
  message?: string;
  company?: string | null; // honeypot
  subject?: string | null;
};

function validateEmail(e?: string) {
  return typeof e === "string" && /^\S+@\S+\.\S+$/.test(e);
}

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendBrevoEmail(payload: Record<string, unknown>) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo API error ${res.status}: ${text}`);
  }

  return res.json().catch(() => ({}));
}

/**
 * OPTIONS handler to satisfy preflight requests (CORS)
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * POST /api/contact
 *
 * Accepts JSON: { name, email, message, company (honeypot), subject? }
 * - If honeypot (company) is filled -> treat as bot (silently drop)
 * - Sends admin notification and optional ack to sender via Brevo (best-effort)
 * - Does NOT persist to DB
 *
 * Required env:
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (or EMAIL_FROM)
 *
 * Optional env:
 * - BREVO_SENDER_NAME
 * - ADMIN_NOTIFICATION_EMAIL | ADMIN_EMAIL | SUPPORT_EMAIL
 * - SEND_CONTACT_ACK (set to "false" to disable sending acknowledgement to user)
 */
export async function POST(request: Request) {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "").trim();
    const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Coffee Genius";
    const adminEmail =
      (process.env.ADMIN_NOTIFICATION_EMAIL ||
        process.env.ADMIN_EMAIL ||
        process.env.SUPPORT_EMAIL ||
        process.env.BREVO_SENDER_EMAIL ||
        ""
      ).trim();

    if (!apiKey) {
      return NextResponse.json({ success: false, message: "BREVO_API_KEY not configured" }, { status: 500 });
    }
    if (!senderEmail) {
      return NextResponse.json({ success: false, message: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured" }, { status: 500 });
    }

    const body: ContactPayload = await request.json().catch(() => ({}));

    // Honeypot check (field often named company, hidden on frontend)
    if (body.company && String(body.company).trim().length > 0) {
      // Likely a bot — respond 200 to avoid feedback and do not process
      return NextResponse.json({ success: true, message: "OK" }, { status: 200 });
    }

    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const message = (body.message || "").trim();
    const subjectRaw = (body.subject || "").trim();

    if (!name || !email || !message) {
      return NextResponse.json({ success: false, message: "name, email and message are required" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ success: false, message: "invalid email address" }, { status: 400 });
    }

    const subject = subjectRaw || `New contact form message from ${name}`;

    // Build admin email (HTML + text)
    const escapedName = escapeHtml(name);
    const escapedEmail = escapeHtml(email);
    const escapedMessage = escapeHtml(message).replace(/\n/g, "<br/>");

    const adminHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#111;">
        <h2>New contact form message</h2>
        <p><strong>Name:</strong> ${escapedName}</p>
        <p><strong>Email:</strong> ${escapedEmail}</p>
        <p><strong>Message:</strong></p>
        <div style="margin-top:8px;padding:12px;border-radius:8px;background:#f7f7f8;border:1px solid #eee;">${escapedMessage}</div>
        <p style="margin-top:12px;color:#666;font-size:13px;">Received: ${new Date().toLocaleString()}</p>
      </div>
    `;

    const adminText = [
      "New contact form message",
      `Name: ${name}`,
      `Email: ${email}`,
      "Message:",
      message,
      "",
      `Received: ${new Date().toLocaleString()}`,
    ].join("\n");

    const sendPromises: Promise<unknown>[] = [];

    if (adminEmail) {
      const adminPayload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: adminEmail }],
        subject: `[Contact] ${subject}`,
        htmlContent: adminHtml,
        textContent: adminText,
      };
      sendPromises.push(sendBrevoEmail(adminPayload));
    }

    // Optionally send acknowledgment to user (best-effort). Controlled by env SEND_CONTACT_ACK (default true)
    const sendAck = (String(process.env.SEND_CONTACT_ACK ?? "true").toLowerCase() !== "false");
    if (sendAck) {
      const ackHtml = `
        <div style="font-family: Arial, Helvetica, sans-serif; color:#111;">
          <h2>Thanks for reaching out, ${escapedName}!</h2>
          <p>We received your message and will get back to you as soon as possible.</p>
          <div style="margin-top:12px;padding:12px;border-radius:8px;background:#f7f7f8;border:1px solid #eee;">
            <strong>Your message:</strong>
            <div style="margin-top:8px;">${escapedMessage}</div>
          </div>
          <p style="margin-top:12px;color:#666;font-size:13px;">If this was urgent, call us at ${escapeHtml(process.env.COMPANY_PHONE || "") || "our phone number"}.</p>
        </div>
      `;
      const ackText = [
        `Hi ${name},`,
        "",
        "Thanks — we received your message and we'll get back to you shortly.",
        "",
        "Your message:",
        message,
        "",
        `If urgent, call: ${process.env.COMPANY_PHONE || ""}`,
      ].join("\n");

      const ackPayload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: `${process.env.COMPANY_NAME || senderName} — We've received your message`,
        htmlContent: ackHtml,
        textContent: ackText,
      };

      sendPromises.push(sendBrevoEmail(ackPayload));
    }

    // Await all sends but tolerate partial failures
    const results = await Promise.allSettled(sendPromises);
    const rejections = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    if (rejections.length > 0) {
      console.warn("Contact API: some email sends failed:", rejections.map((r) => r.reason?.toString?.() ?? r));
      // Still return 200 so UX is smooth; optionally provide partial message
      return NextResponse.json({ success: true, message: "Message received (email send partially failed)" }, { status: 200 });
    }

    return NextResponse.json({ success: true, message: "Message sent" }, { status: 200 });
  } catch (err) {
    console.error("POST /api/contact error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Server error", error: message }, { status: 500 });
  }
}