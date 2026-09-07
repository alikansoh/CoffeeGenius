/**
 * lib/notifyTelegramOrder.ts
 *
 * Sends a Telegram message to the admin chat when a new order is paid.
 *
 * Setup:
 * 1. Message @BotFather on Telegram, run /newbot, follow the prompts.
 *    You'll get a bot token like "123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".
 * 2. Start a chat with your new bot (or add it to a group) and send it any message.
 * 3. Get your chat id: open
 *      https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
 *    in a browser after step 2 and read "chat":{"id": ...} from the response.
 *    For a group chat, this id is usually negative.
 * 4. Set in .env.local:
 *      TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *      TELEGRAM_CHAT_ID=123456789
 */

export type TelegramOrderAddress = {
  firstName?: string;
  lastName?: string;
  address?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
};

export type TelegramOrderSummary = {
  orderId: string;
  orderNumber: string;
  total: number;
  currency?: string;
  clientName?: string;
  clientEmail?: string;
  items: Array<{ name: string; qty: number; unitPrice?: number; totalPrice?: number }>;
  dashboardUrl?: string;
  couponName?: string | null;
  discount?: number;
  shippingAddress?: TelegramOrderAddress | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtMoney(n: number | undefined, currency = "GBP"): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "";
  const symbol = currency.toUpperCase() === "GBP" ? "£" : "";
  return `${symbol}${n.toFixed(2)}`;
}

export async function notifyTelegramOrder(
  order: TelegramOrderSummary
): Promise<{ sent: true } | { sent: false; error: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) return { sent: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  if (!chatId) return { sent: false, error: "TELEGRAM_CHAT_ID not configured" };

  const itemLines = order.items
    .map((it) => `• ${escapeHtml(it.name)} × ${it.qty}${it.totalPrice ? ` — ${fmtMoney(it.totalPrice, order.currency)}` : ""}`)
    .join("\n");

  const lines = [
    `🛎️ <b>New order ${escapeHtml(order.orderNumber)}</b>`,
    "",
    itemLines,
    "",
    `<b>Total:</b> ${fmtMoney(order.total, order.currency)}`,
  ];

  if (order.couponName && order.discount) {
    lines.push(`<b>Coupon:</b> ${escapeHtml(order.couponName)} (-${fmtMoney(order.discount, order.currency)})`);
  }

  if (order.clientName || order.clientEmail) {
    lines.push("", `<b>Customer:</b> ${escapeHtml(order.clientName || "")}`.trimEnd());
    if (order.clientEmail) lines.push(escapeHtml(order.clientEmail));
  }

  const addr = order.shippingAddress;
  const addrLine1 = [addr?.address, addr?.unit].filter(Boolean).join(", ");
  const addrLine2 = [addr?.city, addr?.postcode, addr?.country].filter(Boolean).join(", ");
  if (addr && (addrLine1 || addrLine2)) {
    const fullName = [addr.firstName, addr.lastName].filter(Boolean).join(" ");
    lines.push("", "<b>Shipping address:</b>");
    if (fullName) lines.push(escapeHtml(fullName));
    if (addrLine1) lines.push(escapeHtml(addrLine1));
    if (addrLine2) lines.push(escapeHtml(addrLine2));
    if (addr.phone) lines.push(escapeHtml(addr.phone));
  }

  if (order.dashboardUrl) {
    lines.push("", `<a href="${escapeHtml(order.dashboardUrl)}">View in admin dashboard</a>`);
  }

  const text = lines.join("\n");

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
      return { sent: false, error: `Telegram API ${resp.status}: ${body}` };
    }

    return { sent: true };
  } catch (err: unknown) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
