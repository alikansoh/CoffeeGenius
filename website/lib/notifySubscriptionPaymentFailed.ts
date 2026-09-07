/**
 * lib/notifySubscriptionPaymentFailed.ts
 *
 * Emails the customer the moment a subscription renewal (or initial) charge fails —
 * without this, a declined card just silently flips the subscription to past_due/unpaid
 * with nothing telling the customer to fix it. Links to their manage-subscription page,
 * which has an "Update payment method" button (Stripe Billing Portal).
 *
 * Required env vars: BREVO_API_KEY, BREVO_SENDER_EMAIL (or EMAIL_FROM)
 * Optional: BREVO_SENDER_NAME, COMPANY_NAME, APP_BASE_URL
 */

type SendResult =
  | { sent: true; info: unknown }
  | { sent: false; error?: string; reason?: "no-recipient" | "send-failed" };

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifySubscriptionPaymentFailed(opts: {
  email?: string | null;
  name?: string | null;
  variantLabel: string;
  subscriptionPrice: number;
  frequencyWeeks: number;
  manageToken: string;
  /** How many more attempts Stripe will make before giving up, if known. */
  nextAttemptDate?: Date | null;
}): Promise<SendResult> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Coffee Genius";
  const companyName = process.env.COMPANY_NAME || senderName;
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");

  if (!brevoApiKey) return { sent: false, error: "BREVO_API_KEY not configured" };
  if (!senderEmail) return { sent: false, error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured" };
  if (!opts.email) return { sent: false, reason: "no-recipient", error: "No email on subscription" };

  const manageUrl = `${appBase}/manage-subscription/${opts.manageToken}`;
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hello,";
  const retryLine = opts.nextAttemptDate
    ? `We'll try again on ${opts.nextAttemptDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })}, but updating your card now will avoid any interruption to your deliveries.`
    : "Please update your card to avoid any interruption to your deliveries.";

  const htmlContent = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <div style="padding:28px 24px;border-bottom:2px solid #dc2626;">
      <h1 style="margin:0;font-size:22px;font-weight:700;">${escapeHtml(companyName)}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
        We couldn't take payment for your coffee subscription — your card may have expired or been declined.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${retryLine}</p>

      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${escapeHtml(opts.variantLabel)}</p>
        <p style="margin:0;font-size:18px;font-weight:700;">£${opts.subscriptionPrice.toFixed(2)} <span style="font-size:13px;font-weight:400;color:#6b7280;">every ${opts.frequencyWeeks} week${opts.frequencyWeeks > 1 ? "s" : ""}</span></p>
      </div>

      <a href="${manageUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">Update payment method</a>

      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Keep this link private — anyone with it can manage this subscription. If the button above doesn't work, copy this into your browser:<br/>
        <span style="word-break:break-all;">${manageUrl}</span>
      </p>
    </div>
  </div>`;

  const textContent = [
    greeting,
    "We couldn't take payment for your coffee subscription — your card may have expired or been declined.",
    retryLine,
    "",
    `${opts.variantLabel} — £${opts.subscriptionPrice.toFixed(2)} every ${opts.frequencyWeeks} week${opts.frequencyWeeks > 1 ? "s" : ""}`,
    "",
    `Update payment method: ${manageUrl}`,
  ].join("\n");

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.email, name: opts.name || undefined }],
    subject: `${companyName} — Action needed: update your payment method`,
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
      return { sent: false, error: `Brevo API error ${resp.status}: ${text}`, reason: "send-failed" };
    }

    const info = await resp.json().catch(() => ({}));
    return { sent: true, info };
  } catch (err: unknown) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "send-failed",
    };
  }
}
