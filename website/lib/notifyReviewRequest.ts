/**
 * lib/notifyReviewRequest.ts
 *
 * Emails a customer 3 days after their order ships, asking for a Google and/or Trustpilot
 * review — sent once per order by the cron at app/api/cron/review-requests.
 *
 * Required env vars:
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (or EMAIL_FROM)
 * - GOOGLE_PLACE_ID — builds the Google "write a review" deep link
 * Optional:
 * - TRUSTPILOT_REVIEW_URL — full URL to your Trustpilot review page; the Trustpilot button is
 *   skipped entirely (Google-only email) until this is set
 * - BREVO_SENDER_NAME, COMPANY_NAME
 */

type SendResult =
  | { sent: true; info: unknown }
  | { sent: false; error?: string; reason?: "no-recipient" | "not-configured" | "send-failed" };

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Real hosted PNG files (public/review-*-logo.png), not inline SVG data URIs — Gmail strips/
// blocks `data:image/svg+xml` images outright (shows as an empty broken-image square), even
// though the same data URI renders fine in Apple Mail/Outlook. A normal hosted PNG image URL
// is the one format every major email client reliably renders.

/** Email-safe Cloudinary thumbnail — forces JPG output rather than Cloudinary's usual f_auto,
 *  since some email image proxies (Gmail's included) don't reliably content-negotiate modern
 *  formats (AVIF/WebP) the way a browser does. Returns null if no cloud name is configured, so
 *  callers can just skip the image rather than render a broken one. */
function cloudinaryThumbUrl(publicId: string, size = 120): string | null {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const encoded = publicId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${size},h_${size},c_fill,q_auto:good,f_jpg/${encoded}`;
}

export async function notifyReviewRequest(opts: {
  email?: string | null;
  name?: string | null;
  orderNumber: string;
  /** The products from this order — rendered as a small photo row above the review buttons.
   *  imagePublicId missing/unresolved just means that one item renders without a thumbnail. */
  items?: { name: string; qty: number; imagePublicId?: string }[];
}): Promise<SendResult> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Coffee Genius";
  const companyName = process.env.COMPANY_NAME || senderName;
  const googlePlaceId = process.env.GOOGLE_PLACE_ID;
  const trustpilotUrl = process.env.TRUSTPILOT_REVIEW_URL;
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");

  if (!brevoApiKey) return { sent: false, error: "BREVO_API_KEY not configured" };
  if (!senderEmail) return { sent: false, error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured" };
  if (!opts.email) return { sent: false, reason: "no-recipient", error: "No email on order" };
  if (!googlePlaceId) return { sent: false, reason: "not-configured", error: "GOOGLE_PLACE_ID not configured" };

  const googleReviewUrl = `https://search.google.com/local/writereview?placeid=${googlePlaceId}`;
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hello,";

  const googleLogoUri = `${appBase}/review-google-logo.png`;
  const trustpilotLogoUri = `${appBase}/review-trustpilot-logo.png`;

  // "Bulletproof" email buttons: the background/border live on the OUTER <td>, and the <a>
  // wraps only inline content (an <img> + text) — never a nested <table>. Nesting a <table>
  // directly inside an <a> is invalid HTML5, and Gmail's sanitizer silently strips/mangles
  // that structure (this is exactly why the buttons disappeared while plain <img> product
  // thumbnails elsewhere in the email rendered fine — same underlying cause).
  const googleButtonCell = `
    <td style="padding:0 8px 10px 0;background:#ffffff;border:1px solid #dadce0;border-radius:10px;" valign="middle">
      <a href="${googleReviewUrl}" style="display:inline-block;text-decoration:none;padding:11px 20px 11px 16px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#3c4043;white-space:nowrap;">
        <img src="${googleLogoUri}" width="20" height="20" alt="Google" style="vertical-align:middle;margin-right:10px;border:0;">Rate us on Google
      </a>
    </td>`;

  const trustpilotButtonCell = trustpilotUrl
    ? `
    <td style="padding:0 0 10px 0;background:#00b67a;border-radius:10px;" valign="middle">
      <a href="${trustpilotUrl}" style="display:inline-block;text-decoration:none;padding:11px 20px 11px 16px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;white-space:nowrap;">
        <img src="${trustpilotLogoUri}" width="20" height="20" alt="Trustpilot" style="vertical-align:middle;margin-right:10px;border:0;">Rate us on Trustpilot
      </a>
    </td>`
    : "";

  const buttons = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${googleButtonCell}
      ${trustpilotButtonCell}
    </tr></table>`;

  const items = opts.items || [];
  const productRows = items
    .map((item) => {
      const thumb = item.imagePublicId ? cloudinaryThumbUrl(item.imagePublicId) : null;
      const imageCell = thumb
        ? `<img src="${thumb}" width="56" height="56" alt="${escapeHtml(item.name)}" style="display:block;border-radius:8px;object-fit:cover;">`
        : `<div style="width:56px;height:56px;border-radius:8px;background:#f3f4f6;"></div>`;
      return `
        <tr>
          <td style="padding:6px 12px 6px 0;" valign="middle">${imageCell}</td>
          <td style="padding:6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111827;" valign="middle">
            ${escapeHtml(item.name)}${item.qty > 1 ? ` <span style="color:#6b7280;">× ${item.qty}</span>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  const productBlock = productRows
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:22px;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
        ${productRows}
      </table>`
    : "";

  const htmlContent = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <div style="padding:28px 24px;border-bottom:2px solid #111827;">
      <h1 style="margin:0;font-size:22px;font-weight:700;">${escapeHtml(companyName)}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
        We hope you're enjoying your coffee from order <strong>#${escapeHtml(opts.orderNumber)}</strong>!
        If you have a moment, a quick review would mean a lot to us and helps other coffee
        lovers find us.
      </p>

      ${productBlock}

      <div>${buttons}</div>

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Thanks for being a customer — we really appreciate it.
      </p>
    </div>
  </div>`;

  const textContent = [
    greeting,
    `We hope you're enjoying your coffee from order #${opts.orderNumber}! If you have a moment, a quick review would mean a lot to us.`,
    "",
    ...(items.length ? ["Your order:", ...items.map((it) => `- ${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`), ""] : []),
    `Review us on Google: ${googleReviewUrl}`,
    trustpilotUrl ? `Review us on Trustpilot: ${trustpilotUrl}` : "",
    "",
    "Thanks for being a customer!",
  ]
    .filter(Boolean)
    .join("\n");

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.email, name: opts.name || undefined }],
    subject: `${companyName} — How was your order?`,
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
