/**
 * lib/notifyAdminNewSubscription.ts
 *
 * Emails the admin whenever a subscription payment succeeds — the first charge AND every
 * renewal — mirrors notificationService.ts's sendAdminNotification (used for one-off orders).
 * Renewals need this just as much as the first payment: there's no automatic Order/fulfilment
 * record yet for subscription deliveries, so this email is currently the only signal telling
 * admin a delivery needs to be packed and shipped.
 * Same env vars: BREVO_API_KEY, BREVO_SENDER_EMAIL (or EMAIL_FROM), ADMIN_NOTIFICATION_EMAIL
 * (or ADMIN_EMAIL, comma-separated for multiple recipients).
 */

interface AdminSubscriptionShippingAddress {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
}

interface AdminSubscriptionNotificationInput {
  reason: "initial" | "renewal";
  variantLabel: string;
  subscriptionPrice: number;
  frequencyWeeks: number;
  clientName?: string;
  clientEmail?: string;
  introDiscountPercent?: number;
  introCycles?: number;
  dashboardUrl?: string;
  shippingAddress?: AdminSubscriptionShippingAddress;
}

/** No-ops (with a console warning) if no admin recipient is configured — same behavior as
 *  sendAdminNotification, so a missing env var doesn't break the checkout flow it's called from. */
export async function notifyAdminNewSubscription(payload: AdminSubscriptionNotificationInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "").trim();
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || "Store";
  const adminEnv = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || "").trim();

  const admins = adminEnv
    ? adminEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (admins.length === 0) {
    console.warn("[AdminSubscriptionNotification] No ADMIN_NOTIFICATION_EMAIL configured — skipping.");
    return;
  }
  if (!apiKey) {
    console.warn("[AdminSubscriptionNotification] BREVO_API_KEY not configured — skipping.");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!senderEmail || !emailRegex.test(senderEmail)) {
    console.warn("[AdminSubscriptionNotification] Invalid or missing sender email — skipping.");
    return;
  }

  const to = admins.filter((a) => emailRegex.test(a)).map((a) => ({ email: a, name: "Admin" }));
  if (to.length === 0) {
    console.warn("[AdminSubscriptionNotification] No valid admin recipient emails — skipping.");
    return;
  }

  const isRenewal = payload.reason === "renewal";
  const subject = isRenewal
    ? `Subscription renewed — prepare delivery: ${payload.variantLabel}`
    : `New subscription: ${payload.variantLabel} — £${payload.subscriptionPrice.toFixed(2)}/${payload.frequencyWeeks}wk`;
  const dashboardLink = payload.dashboardUrl
    ? `<p><a href="${payload.dashboardUrl}">Open in admin dashboard</a></p>`
    : "";
  const introLine = payload.introDiscountPercent && payload.introCycles
    ? `<p><strong>Intro offer:</strong> ${payload.introDiscountPercent}% off first ${payload.introCycles} deliveries</p>`
    : "";

  const addr = payload.shippingAddress;
  const addrLine1 = [addr?.line1, addr?.unit].filter(Boolean).join(", ");
  const addrLine2 = [addr?.city, addr?.postcode, addr?.country].filter(Boolean).join(", ");
  const addressBlock =
    addr && (addrLine1 || addrLine2)
      ? `<p><strong>Ship to:</strong><br/>
          ${[addr.firstName, addr.lastName].filter(Boolean).join(" ")}<br/>
          ${addrLine1}<br/>
          ${addrLine2}
          ${addr.phone ? `<br/>${addr.phone}` : ""}
        </p>`
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>${isRenewal ? "🔔 Subscription renewed — prepare this delivery" : "New subscription started"}</h2>
      <p><strong>Product:</strong> ${payload.variantLabel}</p>
      <p><strong>Price:</strong> £${payload.subscriptionPrice.toFixed(2)} every ${payload.frequencyWeeks} week${payload.frequencyWeeks > 1 ? "s" : ""}</p>
      ${introLine}
      <p><strong>Customer:</strong> ${payload.clientName || "—"} ${payload.clientEmail ? `(&lt;${payload.clientEmail}&gt;)` : ""}</p>
      ${addressBlock}
      ${dashboardLink}
      <p style="color: #666; font-size: 12px;">This is an automated notification.</p>
    </div>
  `;

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to,
        subject,
        htmlContent: html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn(`[AdminSubscriptionNotification] Brevo API error ${resp.status}: ${text}`);
    }
  } catch (err) {
    console.warn("[AdminSubscriptionNotification] Failed to send:", err);
  }
}
