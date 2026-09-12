/**
 * lib/notifyTelegramSubscription.ts
 *
 * Sends a Telegram message to the admin chat whenever a subscription payment succeeds —
 * the first charge AND every renewal — mirrors notifyTelegramOrder.ts's setup/behavior,
 * just for subscriptions. Renewals get flagged as "prepare this delivery" since there's
 * no automatic Order/fulfilment record for subscription deliveries yet. Uses the same
 * TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars (TELEGRAM_CHAT_ID may be a
 * comma-separated list) plus anyone who has pressed /start on the bot via the
 * /api/webhooks/telegram webhook (see notifyTelegramOrder.ts for the shared helper).
 */

import dbConnect from "@/lib/dbConnect";
import TelegramSubscriber from "@/models/TelegramSubscriber";

export type TelegramSubscriptionShippingAddress = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
};

export type TelegramSubscriptionSummary = {
  reason: "initial" | "renewal";
  variantLabel: string;
  subscriptionPrice: number;
  frequencyWeeks: number;
  clientName?: string;
  clientEmail?: string;
  introDiscountPercent?: number;
  introCycles?: number;
  dashboardUrl?: string;
  shippingAddress?: TelegramSubscriptionShippingAddress;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}

async function getAllChatIds(): Promise<string[]> {
  const envIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  let dbIds: string[] = [];
  try {
    await dbConnect();
    const subs = await TelegramSubscriber.find({ isActive: true }).select("chatId").lean();
    dbIds = subs.map((s) => s.chatId);
  } catch (err) {
    console.error("Failed to load Telegram subscribers:", err);
  }

  return Array.from(new Set([...envIds, ...dbIds]));
}

export async function notifyTelegramNewSubscription(
  sub: TelegramSubscriptionSummary
): Promise<{ sent: true } | { sent: false; error: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = await getAllChatIds();

  if (!botToken) return { sent: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  if (chatIds.length === 0) return { sent: false, error: "TELEGRAM_CHAT_ID not configured" };

  const isRenewal = sub.reason === "renewal";
  const lines = [
    isRenewal
      ? `🔔 <b>Subscription renewed — prepare this delivery</b>`
      : `🔁 <b>New subscription started</b>`,
    "",
    `• ${escapeHtml(sub.variantLabel)}`,
    `<b>Price:</b> ${fmtMoney(sub.subscriptionPrice)} every ${sub.frequencyWeeks} week${
      sub.frequencyWeeks > 1 ? "s" : ""
    }`,
  ];

  if (sub.introDiscountPercent && sub.introCycles) {
    lines.push(`<b>Intro offer:</b> ${sub.introDiscountPercent}% off first ${sub.introCycles} deliveries`);
  }

  if (sub.clientName || sub.clientEmail) {
    lines.push("", `<b>Customer:</b> ${escapeHtml(sub.clientName || "")}`.trimEnd());
    if (sub.clientEmail) lines.push(escapeHtml(sub.clientEmail));
  }

  const addr = sub.shippingAddress;
  const addrLine1 = [addr?.line1, addr?.unit].filter(Boolean).join(", ");
  const addrLine2 = [addr?.city, addr?.postcode, addr?.country].filter(Boolean).join(", ");
  if (addr && (addrLine1 || addrLine2)) {
    const fullName = [addr.firstName, addr.lastName].filter(Boolean).join(" ");
    lines.push("", "<b>Ship to:</b>");
    if (fullName) lines.push(escapeHtml(fullName));
    if (addrLine1) lines.push(escapeHtml(addrLine1));
    if (addrLine2) lines.push(escapeHtml(addrLine2));
    if (addr.phone) lines.push(escapeHtml(addr.phone));
  }

  if (sub.dashboardUrl) {
    lines.push("", `<a href="${escapeHtml(sub.dashboardUrl)}">View in admin dashboard</a>`);
  }

  const text = lines.join("\n");

  const errors: string[] = [];

  for (const chatId of chatIds) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        errors.push(`chat ${chatId}: Telegram API ${resp.status}: ${body}`);
      }
    } catch (err: unknown) {
      errors.push(`chat ${chatId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) return { sent: false, error: errors.join(" | ") };
  return { sent: true };
}
