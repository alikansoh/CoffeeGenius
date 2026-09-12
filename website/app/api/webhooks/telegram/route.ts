'use server';

/**
 * app/api/webhooks/telegram/route.ts
 *
 * Telegram calls this endpoint automatically whenever someone messages the bot
 * (Telegram "Bot API webhook"). We use it to auto-register anyone who presses
 * /start (or /stop to unsubscribe) so they start receiving admin alerts
 * immediately — no manual chat-id lookup needed.
 *
 * One-time setup after deploying, run once in a browser or with curl:
 *   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://yourdomain.com/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Set TELEGRAM_WEBHOOK_SECRET in .env.local to any random string and pass the
 * same value as secret_token above — Telegram echoes it back on every request
 * as the X-Telegram-Bot-Api-Secret-Token header, which we verify below so
 * randoms on the internet can't post fake /start events.
 */

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TelegramSubscriber from '@/models/TelegramSubscriber';

const botToken = process.env.TELEGRAM_BOT_TOKEN;

async function sendReply(chatId: number | string, text: string) {
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // best-effort reply only
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (header !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update?.message;
  const chat = message?.chat;
  const text: string | undefined = message?.text;

  if (chat?.id) {
    try {
      await dbConnect();

      if (text?.startsWith('/start')) {
        await TelegramSubscriber.findOneAndUpdate(
          { chatId: String(chat.id) },
          {
            chatId: String(chat.id),
            firstName: chat.first_name,
            lastName: chat.last_name,
            username: chat.username,
            isActive: true,
          },
          { upsert: true, new: true }
        );
        await sendReply(chat.id, "✅ You're subscribed to CoffeeGenius admin alerts. Send /stop to unsubscribe.");
      } else if (text?.startsWith('/stop')) {
        await TelegramSubscriber.findOneAndUpdate(
          { chatId: String(chat.id) },
          { isActive: false }
        );
        await sendReply(chat.id, "You've been unsubscribed. Send /start to re-subscribe anytime.");
      }
    } catch (err) {
      console.error('Telegram webhook error:', err);
    }
  }

  // Always respond 200 quickly, otherwise Telegram will retry the update.
  return NextResponse.json({ ok: true });
}
