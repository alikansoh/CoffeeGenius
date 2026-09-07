/**
 * lib/notifySubscriptionManage.ts
 *
 * Emails the customer their "manage subscription" link after every successful
 * subscription payment (the initial charge and every renewal) — this link, built
 * from the subscription's manageToken, is the only way a customer can view or
 * cancel their subscription since there's no customer login system.
 *
 * Required env vars:
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (or EMAIL_FROM)
 * Optional:
 * - BREVO_SENDER_NAME
 * - COMPANY_NAME
 * - APP_BASE_URL
 */

type SendResult =
  | { sent: true; info: unknown }
  | { sent: false; error?: string; reason?: "no-recipient" | "send-failed" };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifySubscriptionManageLink(opts: {
  email?: string | null;
  name?: string | null;
  variantLabel: string;
  subscriptionPrice: number;
  frequencyWeeks: number;
  manageToken: string;
  /** "initial" for the very first charge, "renewal" for every cycle after */
  reason: "initial" | "renewal";
  /** Set only while an intro offer is still active on this subscription — explains that the
   *  price shown is temporary and what it reverts to, so the later price increase isn't a
   *  surprise. The initial charge itself counts as delivery 1 of cyclesLimit. */
  introOffer?: {
    cyclesLimit: number;
    normalPrice: number;
  };
}): Promise<SendResult> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Coffee Genius";
  const companyName = process.env.COMPANY_NAME || senderName;
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");

  if (!brevoApiKey) {
    return { sent: false, error: "BREVO_API_KEY not configured" };
  }
  if (!senderEmail) {
    return { sent: false, error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured" };
  }
  if (!opts.email) {
    return { sent: false, reason: "no-recipient", error: "No email on subscription" };
  }

  const manageUrl = `${appBase}/manage-subscription/${opts.manageToken}`;
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hello,";
  const intro =
    opts.reason === "initial"
      ? "Your subscription is confirmed! Here's your link to manage it any time — view upcoming deliveries, or cancel whenever you like."
      : "Your subscription just renewed. Here's your link to manage it any time — view upcoming deliveries, or cancel whenever you like.";

  // This delivery (the one that was just charged) counts toward cyclesLimit — e.g. cyclesLimit: 2
  // means this price applies to this delivery AND one more, then it reverts.
  const introNote = opts.introOffer
    ? `This intro price applies to your first ${opts.introOffer.cyclesLimit} ${
        opts.introOffer.cyclesLimit > 1 ? "deliveries" : "delivery"
      }. From your ${ordinal(opts.introOffer.cyclesLimit + 1)} delivery onward, it returns to the regular price of £${opts.introOffer.normalPrice.toFixed(2)} every ${opts.frequencyWeeks} week${opts.frequencyWeeks > 1 ? "s" : ""}.`
    : null;

  const htmlContent = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <div style="padding:28px 24px;border-bottom:2px solid #111827;">
      <h1 style="margin:0;font-size:22px;font-weight:700;">${escapeHtml(companyName)}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>

      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${escapeHtml(opts.variantLabel)}</p>
        <p style="margin:0;font-size:18px;font-weight:700;">£${opts.subscriptionPrice.toFixed(2)} <span style="font-size:13px;font-weight:400;color:#6b7280;">every ${opts.frequencyWeeks} week${opts.frequencyWeeks > 1 ? "s" : ""}</span></p>
        <p style="margin:6px 0 0;font-size:13px;color:#059669;font-weight:600;">Delivery is always free</p>
      </div>

      ${
        introNote
          ? `<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:14px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#7e22ce;line-height:1.6;">✦ ${introNote}</p>
            </div>`
          : ""
      }

      <a href="${manageUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">Manage my subscription</a>

      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Keep this link private — anyone with it can manage this subscription. If the button above doesn't work, copy this into your browser:<br/>
        <span style="word-break:break-all;">${manageUrl}</span>
      </p>
    </div>
  </div>`;

  const textContent = [
    greeting,
    intro,
    "",
    `${opts.variantLabel} — £${opts.subscriptionPrice.toFixed(2)} every ${opts.frequencyWeeks} week${opts.frequencyWeeks > 1 ? "s" : ""}`,
    "Delivery is always free.",
    ...(introNote ? ["", introNote] : []),
    "",
    `Manage your subscription: ${manageUrl}`,
  ].join("\n");

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.email, name: opts.name || undefined }],
    subject:
      opts.reason === "initial"
        ? `${companyName} — Your subscription is confirmed`
        : `${companyName} — Your subscription renewed`,
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
