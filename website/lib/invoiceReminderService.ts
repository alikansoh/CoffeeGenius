interface ReminderInput {
    orderNumber: string;
    total: number;
    currency?: string;
    clientName: string;
    clientEmail: string;
    dueDate: Date;
    /** When provided, the invoice PDF is attached to the reminder email — so the customer
     *  doesn't have to hunt down the original invoice email to know what they're paying. */
    pdfBuffer?: Buffer;
  }

  export async function sendInvoiceReminderEmail(input: ReminderInput): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
    const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || 'Your Company';

    if (!apiKey) throw new Error('Missing BREVO_API_KEY');
    if (!senderEmail) throw new Error('Missing sender email');

    const { orderNumber, total, currency = 'gbp', clientName, clientEmail, dueDate, pdfBuffer } = input;
  
    const formattedTotal = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(total);
  
    const formattedDueDate = dueDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0; color: #2d5a8d;">Payment Reminder: Invoice #${orderNumber}</h2>
          </div>
          
          <p>Dear ${escapeHtml(clientName)},</p>
          <p>This is a reminder that payment for your invoice is due soon${pdfBuffer ? " — your invoice is attached" : ""}.</p>
          
          <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
            <p><strong>Invoice Number:</strong> ${escapeHtml(orderNumber)}</p>
            <p><strong>Due Date:</strong> ${escapeHtml(formattedDueDate)}</p>
            <p><strong>Amount Due:</strong> ${escapeHtml(formattedTotal)}</p>
          </div>
          
          <p style="margin-top: 20px;">If you have already made payment, please disregard this reminder.</p>
          
          <div class="footer">
            <p>This is an automated reminder from ${escapeHtml(senderName)}<br>
            If you have any questions, please contact us.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  
    const textContent = `Payment Reminder - Invoice #${orderNumber}\n\nDear ${clientName},\n\nThis is a friendly reminder that payment for your invoice is due on ${formattedDueDate}.\n\nAmount Due: ${formattedTotal}\n\nIf you have already paid, please disregard this reminder.`;
  
    const payload: Record<string, unknown> = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: clientEmail, name: clientName }],
      subject: `Payment Reminder: Invoice #${orderNumber}`,
      htmlContent,
      textContent,
    };

    if (pdfBuffer) {
      payload.attachment = [
        {
          name: `invoice-${orderNumber}.pdf`,
          content: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        },
      ];
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo API error: ${res.status} ${text}`);
    }
  }
  
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }