// Brevo (Sendinblue) helpers used by the /api/enquiry route.
// Requires env:
// - BREVO_API_KEY
// - BREVO_SENDER_EMAIL (or EMAIL_FROM)
// - BREVO_SENDER_NAME (optional)
// - ADMIN_NOTIFICATION_EMAIL (or ADMIN_EMAIL) for admin recipients

interface EmailRecipient {
  email: string;
  name: string;
}

interface BrevoErrorResponse {
  code?: string;
  message?: string;
}

export async function sendAdminNotification(payload: {
    enquiryId: string;
    clientName?: string;
    clientEmail?: string;
    dashboardUrl?: string;
    subject?: string;
    bodyHtml?: string;
  }): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
    const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || 'Store';
    const adminEnv = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '').trim();
  
    const admins = adminEnv ? adminEnv.split(',').map(s => s.trim()).filter(Boolean) : [];
  
    if (admins.length === 0) {
      console.warn('[AdminNotification] No ADMIN_NOTIFICATION_EMAIL configured — skipping.');
      return;
    }
    if (!apiKey) throw new Error('Missing BREVO_API_KEY');
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!senderEmail || !emailRegex.test(senderEmail)) throw new Error('Invalid or missing BREVO sender email');
  
    const to: EmailRecipient[] = admins.filter(a => emailRegex.test(a)).map(a => ({ email: a, name: 'Admin' }));
    if (to.length === 0) {
      console.warn('[AdminNotification] ADMIN_NOTIFICATION_EMAIL contains no valid addresses — skipping.');
      return;
    }
  
    const subject = payload.subject ?? `New enquiry: ${payload.clientName ?? '—'}`;
    const html = payload.bodyHtml ?? `<div><h2>New enquiry</h2><p>ID: ${payload.enquiryId}</p></div>`;
  
    const body = {
      sender: { name: senderName, email: senderEmail },
      to,
      subject,
      htmlContent: html,
    } as Record<string, unknown>;
  
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      try {
        const json: BrevoErrorResponse = JSON.parse(txt);
        const code = json.code;
        const message = json.message || txt;
        throw new Error(`Brevo API error ${res.status}: code=${code ?? 'unknown'} message=${message}`);
      } catch {
        throw new Error(`Brevo API error ${res.status}: ${txt || 'no response body'}`);
      }
    }
  
    console.log(`[AdminNotification] Sent to ${to.map((t) => t.email).join(', ')}`);
  }
  
  export async function sendCustomerConfirmation(params: {
    to: string;
    business: string;
    contact: string;
    interest?: string;
    enquiryId: string;
  }): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
    const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || 'Store';
  
    if (!apiKey) {
      console.warn('[CustomerConfirmation] BREVO_API_KEY not configured — skipping.');
      return;
    }
    if (!params.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.to)) {
      console.warn('[CustomerConfirmation] Invalid customer email — skipping.');
      return;
    }
  
    const subject = `Thanks — we received your enquiry (${params.enquiryId})`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>Thanks for your enquiry</h2>
        <p>Hi ${params.contact},</p>
        <p>Thanks — we received your enquiry for <strong>${params.business}</strong>. Our team will contact you shortly${params.interest ? ` about ${params.interest}` : ''}.</p>
        <p>Reference: <strong>${params.enquiryId}</strong></p>
        <p>Best regards,<br/>${senderName}</p>
      </div>
    `;
  
    const body = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: params.to, name: params.contact }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>;
  
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[CustomerConfirmation] Brevo returned error:', res.status, txt);
    } else {
      console.log(`[CustomerConfirmation] Sent to ${params.to}`);
    }
  }