/**
 * lib/notifyShipment.ts
 *
 * Sends a professional, monochrome (black & white) shipment notification email to the customer using Brevo.
 * - No logo included (per request).
 * - Clean black & white styling, readable on dark/light backgrounds.
 * - Provider-specific tracking URLs and helpful instructions included.
 * - FIXED: All tracking URLs and methods verified and corrected
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

export type Provider =
  | "royal-mail"
  | "dpd"
  | "evri"
  | "ups"
  | "dhl"
  | "fedex"
  | "parcelforce"
  | "yodel";

type OrderItemLike = {
  name?: string;
  qty?: number;
  unitPrice?: number;
  totalPrice?: number;
};

type AddressLike = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
};

type OrderLike = {
  _id?: mongoose.Types.ObjectId | string;
  items?: OrderItemLike[] | null;
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string | null;
  shippingAddress?: AddressLike | null;
  client?: { name?: string; email?: string } | null;
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

/**
 * Build carrier-specific tracking URLs and optional additional query info.
 * FIXED: All URLs verified and corrected to official tracking portals
 */
function buildTracking(
  provider: Provider,
  code?: string | null,
  postcode?: string | null
) {
  if (!code) return { url: null, note: null };
  
  const pc = postcode ? String(postcode).trim().replace(/\s+/g, "").toUpperCase() : null;
  const cleanCode = String(code).trim();

  switch (provider) {
    case "royal-mail": {
      // Royal Mail tracking requires the tracking number in the URL path
      const url = `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(cleanCode)}`;
      const note = pc
        ? `Royal Mail may request your postcode (${pc}) for additional verification.`
        : null;
      return { url, note };
    }

    case "dpd": {
      // DPD UK tracking - simple parcel number format
      const url = `https://www.dpd.co.uk/apps/tracking/?parcel=${encodeURIComponent(cleanCode)}&postcode=${pc || ""}`;
      const note = pc
        ? `DPD uses your postcode (${pc}) to verify and track your parcel.`
        : "You may need to enter your postcode on the DPD tracking page.";
      return { url, note };
    }

    case "evri": {
      // Evri (formerly Hermes UK) tracking
      const url = `https://www.evri.com/track-a-parcel?parcelCode=${encodeURIComponent(cleanCode)}`;
      const note = pc
        ? `Evri may ask for postcode (${pc}) to show detailed tracking.`
        : null;
      return { url, note };
    }

    case "ups": {
      // UPS tracking with GB locale
      const url = `https://www.ups.com/track?loc=en_GB&tracknum=${encodeURIComponent(cleanCode)}&requester=ST/trackdetails`;
      return { url, note: null };
    }

    case "dhl": {
      // DHL Express Global Tracking
      const url = `https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(cleanCode)}`;
      return { url, note: "DHL tracking updates may take a few hours after dispatch." };
    }

    case "fedex": {
      // FedEx tracking (international format)
      const url = `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(cleanCode)}&cntry_code=gb`;
      return { url, note: null };
    }

    case "parcelforce": {
      // Parcelforce Worldwide (Royal Mail subsidiary)
      const url = `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(cleanCode)}`;
      return { url, note: null };
    }

    case "yodel": {
      // Yodel tracking
      const url = `https://www.yodel.co.uk/tracking/${encodeURIComponent(cleanCode)}`;
      const note = pc
        ? `Yodel may request your postcode (${pc}) for precise tracking updates.`
        : null;
      return { url, note };
    }

    default:
      return { url: null, note: null };
  }
}

export async function notifyShipmentToCustomer(opts: {
  order: OrderLike;
  provider: Provider;
  trackingCode?: string | null;
  estimatedDelivery?: string | null;
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
    return {
      sent: false,
      error: "BREVO_API_KEY not configured",
      reason: "send-failed",
    };
  }
  if (!senderEmail) {
    return {
      sent: false,
      error: "BREVO_SENDER_EMAIL (or EMAIL_FROM) not configured",
      reason: "send-failed",
    };
  }

  // Resolve recipient
  const email =
    (opts.order.shippingAddress && opts.order.shippingAddress.email) ||
    (opts.order.client && opts.order.client.email) ||
    (opts.order as any).billingAddress?.email;

  if (!email || typeof email !== "string") {
    return {
      sent: false,
      error: "No recipient email on order",
      reason: "no-recipient",
    };
  }

  const recipientName =
    opts.order.shippingAddress?.firstName || opts.order.client?.name || undefined;
  const orderIdRaw = opts.order._id ? String(opts.order._id) : "—";
  const orderNumber = `#${orderIdRaw.slice(-8)}`;
  const currency = (opts.order.currency || "GBP").toUpperCase();
  const items = Array.isArray(opts.order.items) ? opts.order.items : [];

  // Build items HTML/text
  const htmlRows = items
    .map((it) => {
      const name = escapeHtml(it.name || "Item");
      const qty = Number(it.qty || 0);
      const unit = formatCurrency(Number(it.unitPrice || 0), currency);
      const line = formatCurrency(Number(it.totalPrice || 0), currency);
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${name}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${qty}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${unit}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${line}</td>
        </tr>
      `;
    })
    .join("");

  const textItems = items
    .map((it) => {
      const name = it.name || "Item";
      const qty = Number(it.qty || 0);
      const unit = formatCurrency(Number(it.unitPrice || 0), currency);
      const line = formatCurrency(Number(it.totalPrice || 0), currency);
      return `- ${name} x${qty} | ${unit} | ${line}`;
    })
    .join("\n");

  const subtotalText = formatCurrency(
    opts.order.subtotal || items.reduce((s, it) => s + (it.totalPrice || 0), 0),
    currency
  );
  const shippingText = formatCurrency(opts.order.shipping || 0, currency);
  const totalText = formatCurrency(
    opts.order.total || (opts.order.subtotal || 0) + (opts.order.shipping || 0),
    currency
  );

  const postcode = opts.order.shippingAddress?.postcode || null;
  const tracking = buildTracking(opts.provider, opts.trackingCode ?? null, postcode ?? null);
  const trackingUrl = tracking.url;

  const providerLabel = {
    "royal-mail": "Royal Mail",
    dpd: "DPD",
    evri: "Evri",
    ups: "UPS",
    dhl: "DHL Express",
    fedex: "FedEx",
    parcelforce: "Parcelforce Worldwide",
    yodel: "Yodel",
  }[opts.provider];

  // Provider-specific instruction block (HTML & text)
  let providerHtmlExtra = "";
  let providerTextExtra = "";

  switch (opts.provider) {
    case "royal-mail":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>Royal Mail Tracking:</strong>
          <p style="margin:8px 0 0;">Click the tracking button above or visit Royal Mail's website and enter tracking number <strong>${escapeHtml(opts.trackingCode || "")}</strong>.</p>
          ${postcode ? `<p style="margin:8px 0 0;font-size:13px;">You may be asked for postcode: <strong>${escapeHtml(postcode)}</strong></p>` : ""}
        </div>
      `;
      providerTextExtra = `Royal Mail Tracking: ${opts.trackingCode || "—"}${postcode ? ` (Postcode: ${postcode})` : ""}`;
      break;

    case "dpd":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>DPD Tracking:</strong>
          <p style="margin:8px 0 0;">Track your parcel using number <strong>${escapeHtml(opts.trackingCode || "")}</strong>.</p>
          ${postcode ? `<p style="margin:8px 0 0;font-size:13px;">DPD requires postcode: <strong>${escapeHtml(postcode)}</strong></p>` : ""}
          <p style="margin:8px 0 0;font-size:13px;">💡 Tip: DPD often sends SMS updates on delivery day.</p>
        </div>
      `;
      providerTextExtra = `DPD Tracking: ${opts.trackingCode || "—"}${postcode ? ` (Postcode required: ${postcode})` : ""}`;
      break;

    case "evri":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>Evri Tracking:</strong>
          <p style="margin:8px 0 0;">Track parcel <strong>${escapeHtml(opts.trackingCode || "")}</strong> on the Evri website.</p>
          ${postcode ? `<p style="margin:8px 0 0;font-size:13px;">Postcode may be required: <strong>${escapeHtml(postcode)}</strong></p>` : ""}
        </div>
      `;
      providerTextExtra = `Evri Tracking: ${opts.trackingCode || "—"}`;
      break;

    case "ups":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>UPS Tracking:</strong>
          <p style="margin:8px 0 0;">Track shipment <strong>${escapeHtml(opts.trackingCode || "")}</strong> on UPS.</p>
          <p style="margin:8px 0 0;font-size:13px;">💡 You can sign up for UPS My Choice for delivery preferences.</p>
        </div>
      `;
      providerTextExtra = `UPS Tracking: ${opts.trackingCode || "—"}`;
      break;

    case "dhl":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>DHL Express Tracking:</strong>
          <p style="margin:8px 0 0;">Track shipment <strong>${escapeHtml(opts.trackingCode || "")}</strong> on DHL.</p>
          <p style="margin:8px 0 0;font-size:13px;">Note: Tracking may take 2-4 hours to activate after dispatch.</p>
        </div>
      `;
      providerTextExtra = `DHL Express Tracking: ${opts.trackingCode || "—"}`;
      break;

    case "fedex":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>FedEx Tracking:</strong>
          <p style="margin:8px 0 0;">Track shipment <strong>${escapeHtml(opts.trackingCode || "")}</strong> on FedEx.</p>
        </div>
      `;
      providerTextExtra = `FedEx Tracking: ${opts.trackingCode || "—"}`;
      break;

    case "parcelforce":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>Parcelforce Worldwide Tracking:</strong>
          <p style="margin:8px 0 0;">Track parcel <strong>${escapeHtml(opts.trackingCode || "")}</strong> on Parcelforce.</p>
        </div>
      `;
      providerTextExtra = `Parcelforce Tracking: ${opts.trackingCode || "—"}`;
      break;

    case "yodel":
      providerHtmlExtra = `
        <div style="background:#f5f5f5;padding:12px;border-radius:4px;margin:12px 0;">
          <strong>Yodel Tracking:</strong>
          <p style="margin:8px 0 0;">Track parcel <strong>${escapeHtml(opts.trackingCode || "")}</strong> on Yodel.</p>
          ${postcode ? `<p style="margin:8px 0 0;font-size:13px;">Postcode may be required: <strong>${escapeHtml(postcode)}</strong></p>` : ""}
        </div>
      `;
      providerTextExtra = `Yodel Tracking: ${opts.trackingCode || "—"}`;
      break;

    default:
      providerHtmlExtra = "";
      providerTextExtra = "";
  }

  // Shipping address block
  const ship = opts.order.shippingAddress;
  const shippingLines: string[] = [];
  if (ship) {
    const nameLine = [ship.firstName, ship.lastName].filter(Boolean).join(" ");
    if (nameLine) shippingLines.push(escapeHtml(nameLine));
    if (ship.line1) shippingLines.push(escapeHtml(ship.line1));
    if (ship.unit) shippingLines.push(escapeHtml(ship.unit));
    const cityPost = [ship.city, ship.postcode].filter(Boolean).join(", ");
    if (cityPost) shippingLines.push(escapeHtml(cityPost));
    if (ship.country) shippingLines.push(escapeHtml(ship.country));
  }

  // Monochrome HTML template (no logo)
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shipment Notification</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;color:#000000;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    
    <div style="border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:24px;font-weight:600;">${escapeHtml(companyName)}</h1>
    </div>

    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;">Shipment update — ${orderNumber}</h2>

    <p style="margin:0 0 16px;line-height:1.6;">
      ${recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hello,"}
    </p>

    <p style="margin:0 0 16px;line-height:1.6;">
      Your order ${orderNumber} has been shipped via <strong>${escapeHtml(providerLabel)}</strong>.
      ${opts.trackingCode ? `Tracking number: <strong>${escapeHtml(opts.trackingCode)}</strong>.` : "There is currently no tracking number for this shipment."}
    </p>

    ${trackingUrl ? `
    <div style="margin:20px 0;">
      <a href="${trackingUrl}" 
         style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">
        Track your parcel
      </a>
    </div>
    ` : ""}

    ${providerHtmlExtra}

    <table style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #ddd;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:12px 8px;text-align:left;border-bottom:2px solid #000;">Item</th>
          <th style="padding:12px 8px;text-align:center;border-bottom:2px solid #000;">Qty</th>
          <th style="padding:12px 8px;text-align:right;border-bottom:2px solid #000;">Unit</th>
          <th style="padding:12px 8px;text-align:right;border-bottom:2px solid #000;">Line total</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#666;">No items available</td></tr>`}
        <tr>
          <td colspan="3" style="padding:8px;text-align:right;font-weight:600;border-top:2px solid #000;">Subtotal</td>
          <td style="padding:8px;text-align:right;font-weight:600;border-top:2px solid #000;">${subtotalText}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding:8px;text-align:right;">Shipping</td>
          <td style="padding:8px;text-align:right;">${shippingText}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding:8px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid #000;">Total</td>
          <td style="padding:8px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid #000;">${totalText}</td>
        </tr>
      </tbody>
    </table>

    <div style="background:#f9f9f9;padding:16px;border-radius:4px;margin:24px 0;">
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;">Shipping to</h3>
      ${shippingLines.length 
        ? shippingLines.map(line => `<div style="margin:4px 0;">${line}</div>`).join("") 
        : `<div style="color:#666;">—</div>`
      }
      ${ship?.phone ? `<div style="margin:8px 0 0;">Tel: ${escapeHtml(ship.phone)}</div>` : ""}
    </div>

    <div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:24px 0;">
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;">Shipment details</h3>
      <div style="margin:8px 0;">
        <strong>Carrier:</strong> ${escapeHtml(providerLabel)}
      </div>
      ${opts.trackingCode ? `
      <div style="margin:8px 0;">
        <strong>Tracking:</strong> ${escapeHtml(opts.trackingCode)}
      </div>
      ` : ""}
      ${opts.estimatedDelivery ? `
      <div style="margin:8px 0;">
        <strong>Est. delivery:</strong> ${new Date(opts.estimatedDelivery).toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
      </div>
      ` : ""}
      ${tracking.note ? `
      <div style="margin:12px 0 0;padding:8px;background:#f5f5f5;border-radius:4px;font-size:13px;">
        ${escapeHtml(tracking.note)}
      </div>
      ` : ""}
    </div>

    <div style="margin:32px 0 24px;padding:16px 0;border-top:1px solid #ddd;font-size:14px;color:#666;">
      <p style="margin:0 0 8px;">Questions? Reply to this email or contact ${escapeHtml(supportEmail)}.</p>
      ${appBase ? `
      <p style="margin:8px 0 0;">
        <a href="${appBase}/orders/${orderIdRaw}" style="color:#000;">View your order</a>
      </p>
      ` : ""}
    </div>

    <div style="border-top:1px solid #ddd;padding-top:16px;font-size:12px;color:#999;text-align:center;">
      <p style="margin:0 0 4px;">© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
      <p style="margin:4px 0 0;">Need help? ${escapeHtml(supportEmail)}</p>
    </div>

  </div>
</body>
</html>
  `;

  // Plain-text fallback
  const textContentLines: string[] = [
    `${companyName} — Shipment update for ${orderNumber}`,
    "",
    `${recipientName ? `Hi ${recipientName},` : "Hello,"}`,
    "",
    `Your order ${orderNumber} has been shipped via ${providerLabel}.`,
    opts.trackingCode ? `Tracking number: ${opts.trackingCode}` : "No tracking number available yet.",
    trackingUrl ? `Track here: ${trackingUrl}` : "",
    "",
    providerTextExtra || "",
    "",
    "Items:",
    textItems || "- (no items listed)",
    "",
    `Subtotal: ${subtotalText}`,
    `Shipping: ${shippingText}`,
    `Total: ${totalText}`,
    "",
    "Shipping to:",
    ...(shippingLines.length ? shippingLines.map((l) => l.replace(/<[^>]+>/g, "")) : ["—"]),
    ship?.phone ? `Tel: ${ship.phone}` : "",
    "",
    opts.estimatedDelivery
      ? `Estimated delivery: ${new Date(opts.estimatedDelivery).toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}`
      : "",
    tracking.note ? tracking.note : "",
    appBase ? `View order: ${appBase}/orders/${orderIdRaw}` : "",
    "",
    `If you have questions, contact ${supportEmail}`,
    "",
    `Thanks — ${companyName}`,
  ].filter(Boolean);

  const textContent = textContentLines.join("\n");

  const payload: Record<string, any> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email }],
    subject: `${companyName} — Your order ${orderNumber} has shipped`,
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