import type mongoose from 'mongoose';

interface OrderSummaryItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface AdminNotificationInput {
  orderId: string;
  orderNumber: string;
  total: number;
  currency?: string;
  clientName?: string;
  clientEmail?: string;
  items?: OrderSummaryItem[];
  dashboardUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send a simple admin notification via Brevo (Sendinblue) API.
 * - ADMIN_NOTIFICATION_EMAIL (or ADMIN_EMAIL) may be a single email or comma-separated list.
 * - BREVO_API_KEY and BREVO_SENDER_EMAIL (or EMAIL_FROM) must be set when actually sending.
 *
 * This function will no-op (resolve) if no admin recipient is configured, and will log a warning.
 */
export async function sendAdminNotification(payload: AdminNotificationInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || 'Store';
  const adminEnv = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '').trim();

  // Parse admin recipients (comma separated)
  const admins = adminEnv
    ? adminEnv.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (admins.length === 0) {
    // No admin configured -> no-op but log so you can debug why nothing was sent
    console.warn('[AdminNotification] No ADMIN_NOTIFICATION_EMAIL configured — skipping admin notification.');
    return;
  }

  if (!apiKey) {
    // If API key missing, this is a real config problem — surface it.
    throw new Error('Missing BREVO_API_KEY environment variable');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!senderEmail || !emailRegex.test(senderEmail)) {
    throw new Error('Invalid or missing sender email for Brevo (set BREVO_SENDER_EMAIL or EMAIL_FROM)');
  }

  // Validate recipient emails and build 'to' array
  const to = admins
    .filter(a => emailRegex.test(a))
    .map(a => ({ email: a, name: 'Admin' }));

  if (to.length === 0) {
    console.warn('[AdminNotification] ADMIN_NOTIFICATION_EMAIL is set but contains no valid email addresses — skipping notification.');
    return;
  }

  const subject = `New paid order: ${payload.orderNumber} — £${payload.total.toFixed(2)}`;
  const dashboardLink = payload.dashboardUrl ? `<p><a href="${payload.dashboardUrl}">Open in admin dashboard</a></p>` : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>New paid order</h2>
      <p><strong>Order:</strong> ${payload.orderNumber} (${payload.orderId})</p>
      <p><strong>Total:</strong> ${payload.currency ? payload.currency.toUpperCase() + ' ' : '£'}${payload.total.toFixed(2)}</p>
      <p><strong>Customer:</strong> ${payload.clientName || '—'} ${payload.clientEmail ? `(&lt;${payload.clientEmail}&gt;)` : ''}</p>
      ${payload.items && payload.items.length ? `<h4>Items</h4><ul>${payload.items.map(i => `<li>${i.name} — Qty: ${i.qty} — £${i.totalPrice.toFixed(2)}</li>`).join('')}</ul>` : ''}
      ${dashboardLink}
      <p style="color: #666; font-size: 12px;">This is an automated notification.</p>
    </div>
  `;

  const body = {
    sender: { name: senderName, email: senderEmail },
    to,
    subject,
    htmlContent: html,
  } as Record<string, unknown>;

  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Network error while calling Brevo API: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
  }

  if (!res.ok) {
    // Try to read response for useful error info
    const txt = await res.text().catch(() => '');
    try {
      const json = JSON.parse(txt);
      interface BrevoErrorResponse {
        code?: string;
        message?: string;
      }
      const code = (json as BrevoErrorResponse).code;
      const message = (json as BrevoErrorResponse).message || txt;
      throw new Error(`Brevo API error ${res.status}: code=${code ?? 'unknown'} message=${message}`);
    } catch {
      throw new Error(`Brevo API error ${res.status}: ${txt || 'no response body'}`);
    }
  }

  // success
  console.log(`[AdminNotification] Sent admin notification to: ${to.map(t => t.email).join(', ')}`);
}