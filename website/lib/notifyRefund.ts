/**
 * lib/notifyRefund.ts
 *
 * Sends a professional, monochrome (black & white) refund notification email to the customer using Brevo.
 * - Re-uses the same env vars as the shipment notifier (BREVO_API_KEY, BREVO_SENDER_EMAIL etc).
 * - Returns a simple result object.
 */

import type mongoose from "mongoose";

type AddressLike = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
};

type OrderLike = {
  _id?: mongoose.Types.ObjectId | string;
  total?: number;
  currency?: string | null;
  shippingAddress?: AddressLike | null;
  client?: { name?: string; email?: string } | null;
};

type RefundRecord = {
  refundId: string;
  amount: number;
  currency?: string;
  reason?: string | null;
  refundedAt?: string;
  paymentProviderRefundId?: string | null;
  idempotencyKey?: string | null;
};

type SendResult =
  | { sent: true; info: any }
  | { sent: false; error?: string; reason?: "no-recipient" | "send-failed" };

function formatCurrency(value = 0, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currency || "GBP").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${(value || 0).toFixed(2)}`;
  }
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

export async function notifyRefundToCustomer(opts: {
  order: OrderLike;
  refund: RefundRecord;
}): Promise<SendResult> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = (
    process.env.BREVO_SENDER_EMAIL ||
    process.env.EMAIL_FROM ||
    ""
  ).trim();
  const senderName =
    process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Your Store";
  const supportEmail = process.env.SUPPORT_EMAIL || senderEmail || "";
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const companyName = process.env.COMPANY_NAME || senderName || "Store";

  if (!brevoApiKey) {
    return { sent: false, error: "BREVO_API_KEY not configured", reason: "send-failed" };
  }
  if (!senderEmail) {
    return {
      sent: false,
      error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured",
      reason: "send-failed",
    };
  }

  const email =
    (opts.order.shippingAddress && opts.order.shippingAddress.email) ||
    (opts.order.client && opts.order.client.email);

  if (!email || typeof email !== "string") {
    return { sent: false, error: "No recipient email on order", reason: "no-recipient" };
  }

  const recipientName =
    opts.order.shippingAddress?.firstName || opts.order.client?.name || undefined;
  const orderIdRaw = opts.order._id ? String(opts.order._id) : "—";
  const orderNumber = `#${orderIdRaw.slice(-8)}`;
  const currency = (opts.refund.currency || opts.order.currency || "GBP").toUpperCase();

  const amountText = formatCurrency(Number(opts.refund.amount || 0), currency);
  const refundedAt = opts.refund.refundedAt || new Date().toISOString();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Refund Issued</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;color:#000000;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:24px;font-weight:600;">${escapeHtml(companyName)}</h1>
    </div>

    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;">Refund issued — ${orderNumber}</h2>

    <p style="margin:0 0 16px;line-height:1.6;">
      ${recipientName ? `Dear ${escapeHtml(recipientName)},` : "Hello,"}
    </p>

    <p style="margin:0 0 16px;line-height:1.6;">
      We have processed a refund for your order <strong>${escapeHtml(orderNumber)}</strong>.
      The refunded amount has been returned to the original payment method used at checkout.
    </p>

    <div style="margin:16px 0;padding:16px;border:1px solid #ddd;background:#f9f9f9;border-radius:6px;">
      <div style="margin-bottom:8px;"><strong>Amount refunded:</strong> ${escapeHtml(amountText)}</div>
      <div style="margin-bottom:8px;"><strong>Refund ID:</strong> ${escapeHtml(opts.refund.refundId)}</div>
      ${opts.refund.paymentProviderRefundId ? `<div style="margin-bottom:8px;"><strong>Provider reference:</strong> ${escapeHtml(String(opts.refund.paymentProviderRefundId))}</div>` : ""}
      ${opts.refund.reason ? `<div style="margin-bottom:8px;"><strong>Reason:</strong> ${escapeHtml(String(opts.refund.reason))}</div>` : ""}
      <div style="margin-top:8px;color:#666;font-size:13px;">Refund processed on ${new Date(refundedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</div>
    </div>

    <p style="margin:0 0 16px;line-height:1.6;">
      Please note that it may take between 3–10 business days for the refunded amount to appear on your statement, depending on your bank or card issuer. If you do not see the refund after 10 business days, please contact your bank first and then reach out to us if they cannot locate the transaction.
    </p>

    ${appBase ? `<p style="margin:8px 0;"><a href="${appBase}/orders/${orderIdRaw}" style="color:#000;text-decoration:underline;">View your order</a></p>` : ""}

    <p style="margin:16px 0;color:#666;">If you have any questions or need further assistance, please reply to this email or contact our support team at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#000;text-decoration:underline;">${escapeHtml(supportEmail)}</a>. We are here to help.</p>

    <p style="margin:12px 0 0;">Kind regards,<br>${escapeHtml(companyName)} Customer Support</p>

    <div style="border-top:1px solid #ddd;padding-top:16px;font-size:12px;color:#999;text-align:center;margin-top:24px;">
      <p style="margin:0 0 4px;">© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const textLines = [
    `${companyName} — Refund issued for ${orderNumber}`,
    "",
    `${recipientName ? `Dear ${recipientName},` : "Hello,"}`,
    "",
    `We have processed a refund for your order ${orderNumber}.`,
    `Amount refunded: ${amountText}`,
    `Refund ID: ${opts.refund.refundId}`,
    opts.refund.paymentProviderRefundId ? `Provider reference: ${opts.refund.paymentProviderRefundId}` : undefined,
    opts.refund.reason ? `Reason: ${opts.refund.reason}` : undefined,
    "",
    `Refund processed on: ${new Date(refundedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`,
    "",
    "Please allow 3–10 business days for the refund to appear on your statement. If you do not see the refund after 10 business days, please contact your bank and then contact us if they are unable to help.",
    "",
    appBase ? `View your order: ${appBase}/orders/${orderIdRaw}` : undefined,
    "",
    `If you have any questions or need further assistance, reply to this email or contact us at ${supportEmail}.`,
    "",
    "Kind regards,",
    `${companyName} Customer Support`,
  ].filter(Boolean);

  const textContent = textLines.join("\n");

  const payload: Record<string, any> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email }],
    subject: `${companyName} — Refund issued for order ${orderNumber}`,
    htmlContent,
    textContent,
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
      const text = await resp.text().catch(() => "");
      return {
        sent: false,
        error: `Brevo API error ${resp.status}: ${text}`,
        reason: "send-failed",
      };
    }

    const info = await resp.json().catch(() => ({}));
    return { sent: true, info };
  } catch (err: any) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "send-failed",
    };
  }
}