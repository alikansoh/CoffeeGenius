import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/* ----------------------------- Types ---------------------------------- */
type Nullable<T> = T | null | undefined;

interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface Address {
  firstName?: string;
  lastName?: string;
  unit?: string;
  address?: string;
  line1?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface InvoiceData {
  orderId?: string;
  orderNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  shipping: number;
  total: number;
  client: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress?: Nullable<Address>;
  billingAddress?: Nullable<Address>;
  paidAt?: Nullable<string | Date>;
  dueDate?: Nullable<string | Date>;
  createdAt?: Nullable<string | Date>;
  paymentIntentId?: Nullable<string>;
  currency?: string;
  notes?: string;
}

export interface CompanyInfo {
  name?: string;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  website?: string;
  logoPath?: string;
}

/* -------------------------- Helpers ---------------------------------- */
function tryLoadFontBytes(): Buffer | null {
  const candidates: string[] = [];
  if (process.env.INVOICE_FONT_PATH) {
    candidates.push(process.env.INVOICE_FONT_PATH);
    candidates.push(path.join(process.cwd(), process.env.INVOICE_FONT_PATH));
  }
  candidates.push(path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf'));
  candidates.push(path.resolve(__dirname, '..', 'public', 'fonts', 'DejaVuSans.ttf'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function tryLoadLogoBytes(logoPath?: string): Buffer | null {
  const candidates: string[] = [];
  if (logoPath) {
    candidates.push(logoPath);
    candidates.push(path.join(process.cwd(), logoPath));
  }
  candidates.push(path.join(process.cwd(), 'public', 'logo.png'));
  candidates.push(path.resolve(__dirname, '..', 'public', 'logo.png'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function parseDate(v?: Nullable<string | Date>): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatInvoiceDate(inv: InvoiceData): string {
  const date = parseDate(inv.createdAt) ?? parseDate(inv.paidAt) ?? parseDate(inv.dueDate) ?? new Date();
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
}

function fmtCurrency(value: number, currency = 'GBP') {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency ? currency.toUpperCase() : 'GBP',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
}

function formatAddress(addr?: Nullable<Address>, clientName?: string): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const fullName = [addr.firstName, addr.lastName].filter(Boolean).join(' ') || clientName || '';
  if (fullName) lines.push(fullName);
  if (addr.unit) lines.push(addr.unit);
  if (addr.address || addr.line1) lines.push(addr.address || addr.line1 || '');
  const cityLine = [addr.city, addr.postcode].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  return lines.filter(Boolean);
}

/* ----------------------- PDF generation ------------------------------- */
export async function generateInvoicePDF(invoice: InvoiceData, company: CompanyInfo): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  // Embed fonts
  const fontBytes = tryLoadFontBytes();
  let font: PDFFont;
  let boldFont: PDFFont;

  try {
    if (fontBytes) {
      // embedFont accepts Uint8Array | string names from StandardFonts
      font = await pdfDoc.embedFont(fontBytes);
      boldFont = font; // if no bold available, reuse
      console.log('[Invoice] Embedded custom TTF font for PDF');
    } else {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
  } catch (err) {
    console.warn('[Invoice] Failed to embed custom font, falling back to Helvetica:', (err as Error).message);
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  // Optional logo
  const logoBytes = tryLoadLogoBytes(company.logoPath);
  let logoImage: unknown | null = null;
  if (logoBytes) {
    try {
      // PNG signature check
      const isPng = logoBytes.length >= 8 && logoBytes.slice(0, 8).toString('hex').includes('89504e47');
      logoImage = isPng ? await pdfDoc.embedPng(logoBytes) : await pdfDoc.embedJpg(logoBytes);
    } catch {
      logoImage = null;
    }
  }

  // Use explicit tuple for page size so TypeScript accepts tuple where expected
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  let page = pdfDoc.addPage(pageSize);
  let pageWidth = page.getWidth();
  let pageHeight = page.getHeight();
  const margin = 50;
  let cursorY = pageHeight - margin;

  // Clean color scheme
  const darkText = rgb(0.15, 0.15, 0.15);
  const lightText = rgb(0.45, 0.45, 0.45);
  const accentBlue = rgb(0.2, 0.4, 0.7);
  const borderGray = rgb(0.85, 0.85, 0.85);
  const bgGray = rgb(0.96, 0.96, 0.96);

  const drawText = (text: string, x: number, y: number, size = 10, color = darkText, customFont?: PDFFont) => {
    page.drawText(String(text ?? ''), {
      x,
      y,
      size,
      font: customFont || font,
      color,
    });
  };

  // ============= HEADER SECTION =============
  cursorY = pageHeight - 60;

  // Company logo or name
  if (logoImage) {
    // Narrow the logo object so TypeScript can reason about its properties/methods.
    const maybeImage = logoImage as
      | {
          scale: (n: number) => { width: number; height: number };
          width: number;
          height: number;
        }
      | undefined;

    if (maybeImage) {
      const dims = maybeImage.scale(1);
      const maxLogoWidth = 200;
      const maxLogoHeight = 80;
      const scale = Math.min(maxLogoWidth / dims.width, maxLogoHeight / dims.height, 1);
      const logoW = dims.width * scale;
      const logoH = dims.height * scale;

      // pdf-lib's drawImage expects the embedded image object; assert using unknown->expected param type
      page.drawImage(maybeImage as unknown as Parameters<typeof page.drawImage>[0], {
        x: margin,
        y: cursorY - logoH,
        width: logoW,
        height: logoH,
      });

      // add a small gap below the logo
      cursorY -= logoH + 10;
    } else {
      const companyName = company.name || 'Your Company';
      drawText(companyName, margin, cursorY, 20, darkText, boldFont);
      cursorY -= 30;
    }
  } else {
    const companyName = company.name || 'Your Company';
    drawText(companyName, margin, cursorY, 20, darkText, boldFont);
    cursorY -= 30;
  }

  // Company details on the left
  let companyY = cursorY - 40;
  const companyDetails = [
    company.address,
    [company.city, company.postcode].filter(Boolean).join(' '),
    company.country,
    company.email,
    company.phone,
    company.vatNumber ? `VAT: ${company.vatNumber}` : undefined,
  ].filter((l): l is string => Boolean(l));

  for (const line of companyDetails) {
    drawText(line, margin, companyY, 9, lightText);
    companyY -= 13;
  }

  // Invoice title and details on the right
  const rightColX = pageWidth - margin - 150;
  drawText('INVOICE', rightColX, cursorY, 24, accentBlue, boldFont);

  let rightY = cursorY - 30;
  drawText('Invoice Number', rightColX, rightY, 9, lightText);
  drawText(invoice.orderNumber, rightColX, rightY - 14, 11, darkText, boldFont);

  rightY -= 40;
  drawText('Date', rightColX, rightY, 9, lightText);
  drawText(formatInvoiceDate(invoice), rightColX, rightY - 14, 10, darkText);

  if (invoice.dueDate) {
    const dueDate = parseDate(invoice.dueDate);
    if (dueDate) {
      rightY -= 35;
      drawText('Due Date', rightColX, rightY, 9, lightText);
      drawText(dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), rightColX, rightY - 14, 10, darkText);
    }
  }

  cursorY = pageHeight - 240;

  // ============= ADDRESSES SECTION =============
  drawText('BILL TO', margin, cursorY, 10, lightText, boldFont);
  cursorY -= 18;

  const billLines = formatAddress(invoice.billingAddress ?? invoice.shippingAddress, invoice.client.name);
  if (billLines.length > 0) {
    drawText(billLines[0], margin, cursorY, 11, darkText, boldFont);
    cursorY -= 14;
    for (let i = 1; i < billLines.length; i++) {
      drawText(billLines[i], margin, cursorY, 9, lightText);
      cursorY -= 12;
    }
  } else {
    drawText(invoice.client.name, margin, cursorY, 11, darkText, boldFont);
    cursorY -= 14;
  }

  if (invoice.client.email) {
    cursorY -= 3;
    drawText(invoice.client.email, margin, cursorY, 9, lightText);
    cursorY -= 12;
  }
  if (invoice.client.phone) {
    drawText(invoice.client.phone, margin, cursorY, 9, lightText);
  }

  // Shipping address
  const shipX = pageWidth / 2 + 20;
  let shipY = pageHeight - 240;

  drawText('SHIP TO', shipX, shipY, 10, lightText, boldFont);
  shipY -= 18;

  const shipLines = formatAddress(invoice.shippingAddress, invoice.client.name);
  if (shipLines.length > 0) {
    drawText(shipLines[0], shipX, shipY, 11, darkText, boldFont);
    shipY -= 14;
    for (let i = 1; i < shipLines.length; i++) {
      drawText(shipLines[i], shipX, shipY, 9, lightText);
      shipY -= 12;
    }
  } else {
    drawText('Same as billing', shipX, shipY, 9, lightText);
  }

  cursorY = Math.min(cursorY, shipY) - 40;

  // ============= ITEMS TABLE =============
  const tableStartY = cursorY;

  // Table header
  const headerHeight = 35;
  page.drawRectangle({
    x: margin,
    y: tableStartY - headerHeight,
    width: pageWidth - margin * 2,
    height: headerHeight,
    color: bgGray,
  });

  const colDescX = margin + 15;
  const colQtyX = pageWidth - margin - 230;
  const colPriceX = pageWidth - margin - 150;
  const colTotalX = pageWidth - margin - 70;

  const headerY = tableStartY - 22;
  drawText('Description', colDescX, headerY, 10, darkText, boldFont);
  drawText('Qty', colQtyX, headerY, 10, darkText, boldFont);
  drawText('Price', colPriceX, headerY, 10, darkText, boldFont);
  drawText('Amount', colTotalX, headerY, 10, darkText, boldFont);

  cursorY = tableStartY - headerHeight - 5;

  // Table rows
  const rowHeight = 35;
  const minBottomMargin = 200;

  for (let i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];

    if (cursorY - rowHeight < minBottomMargin) {
      // New page
      page = pdfDoc.addPage(pageSize);
      pageWidth = page.getWidth();
      pageHeight = page.getHeight();
      cursorY = pageHeight - margin - 50;

      // Redraw header on new page
      page.drawRectangle({
        x: margin,
        y: cursorY - headerHeight,
        width: pageWidth - margin * 2,
        height: headerHeight,
        color: bgGray,
      });

      drawText('Description', colDescX, cursorY - 22, 10, darkText, boldFont);
      drawText('Qty', colQtyX, cursorY - 22, 10, darkText, boldFont);
      drawText('Price', colPriceX, cursorY - 22, 10, darkText, boldFont);
      drawText('Amount', colTotalX, cursorY - 22, 10, darkText, boldFont);

      cursorY -= headerHeight + 5;
    }

    // Row separator line
    page.drawLine({
      start: { x: margin, y: cursorY },
      end: { x: pageWidth - margin, y: cursorY },
      thickness: 0.5,
      color: borderGray,
    });

    const rowY = cursorY - 20;

    // Item name
    let itemName = item.name;
    if (itemName.length > 50) {
      itemName = itemName.slice(0, 47) + '...';
    }
    drawText(itemName, colDescX, rowY, 10, darkText);

    // Quantity
    drawText(String(item.qty), colQtyX, rowY, 10, darkText);

    // Unit price
    drawText(fmtCurrency(item.unitPrice, invoice.currency), colPriceX, rowY, 10, lightText);

    // Total
    drawText(fmtCurrency(item.totalPrice, invoice.currency), colTotalX, rowY, 10, darkText, boldFont);

    cursorY -= rowHeight;
  }

  // Bottom table border
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: pageWidth - margin, y: cursorY },
    thickness: 1,
    color: borderGray,
  });

  cursorY -= 40;

  // ============= TOTALS SECTION =============
  const totalsX = pageWidth - margin - 200;
  let totalsY = cursorY;

  // Subtotal
  drawText('Subtotal', totalsX, totalsY, 10, lightText);
  const subtotalStr = fmtCurrency(invoice.subtotal, invoice.currency);
  const subtotalW = font.widthOfTextAtSize(subtotalStr, 10);
  drawText(subtotalStr, pageWidth - margin - subtotalW, totalsY, 10, darkText);

  totalsY -= 25;

  // Shipping
  drawText('Shipping', totalsX, totalsY, 10, lightText);
  const shippingStr = fmtCurrency(invoice.shipping, invoice.currency);
  const shippingW = font.widthOfTextAtSize(shippingStr, 10);
  drawText(shippingStr, pageWidth - margin - shippingW, totalsY, 10, darkText);

  totalsY -= 30;

  // Total separator
  page.drawLine({
    start: { x: totalsX, y: totalsY + 5 },
    end: { x: pageWidth - margin, y: totalsY + 5 },
    thickness: 1,
    color: borderGray,
  });

  totalsY -= 15;

  // Total
  drawText('Total', totalsX, totalsY, 12, darkText, boldFont);
  const totalStr = fmtCurrency(invoice.total, invoice.currency);
  const totalW = boldFont.widthOfTextAtSize(totalStr, 14);
  drawText(totalStr, pageWidth - margin - totalW, totalsY, 14, accentBlue, boldFont);

  // Payment status
  if (invoice.paidAt) {
    const paidDate = parseDate(invoice.paidAt);
    if (paidDate) {
      totalsY -= 25;
      drawText('Status: PAID', totalsX, totalsY, 9, rgb(0.2, 0.6, 0.3), boldFont);
    }
  }

  // Notes
  if (invoice.notes) {
    let notesY = totalsY - 50;
    if (notesY < 150) notesY = 150;

    drawText('Notes:', margin, notesY, 11, darkText, boldFont);
    notesY -= 15;

    const notesMaxWidth = pageWidth - margin * 2 - 220;
    const words = invoice.notes.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 9);

      if (testWidth > notesMaxWidth && currentLine) {
        drawText(currentLine, margin, notesY, 9, lightText);
        notesY -= 12;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      drawText(currentLine, margin, notesY, 9, lightText);
    }
  }

  // ============= FOOTER =============
  const footerY = 40;

  page.drawLine({
    start: { x: margin, y: footerY + 20 },
    end: { x: pageWidth - margin, y: footerY + 20 },
    thickness: 0.5,
    color: borderGray,
  });

  drawText('Thank you for your business', margin, footerY, 9, lightText);

  const footerRight = company.email || company.phone || '';
  if (footerRight) {
    const footerRightW = font.widthOfTextAtSize(footerRight, 8);
    drawText(footerRight, pageWidth - margin - footerRightW, footerY, 8, lightText);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/* ----------------------- Email sending ------------------------------- */
export async function sendInvoiceEmail(invoice: InvoiceData, pdfBuffer: Buffer): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
  const senderName = process.env.BREVO_SENDER_NAME || process.env.COMPANY_NAME || 'Your Company';

  if (!apiKey) throw new Error('Missing BREVO_API_KEY environment variable');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!senderEmail || !emailRegex.test(senderEmail)) {
    throw new Error(`Invalid or missing sender email. Set BREVO_SENDER_EMAIL (or EMAIL_FROM). Current value: "${senderEmail}"`);
  }

  if (!invoice.client?.email || !emailRegex.test(invoice.client.email)) {
    throw new Error('Invoice missing valid client.email');
  }

  const toEmail = invoice.client.email;
  const subject = `Invoice #${invoice.orderNumber} - ${invoice.client.name}`;
  const dateStr = formatInvoiceDate(invoice);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .invoice-details { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0; color: #2d5a8d;">Invoice #${invoice.orderNumber}</h2>
        </div>
        
        <p>Dear ${escapeHtml(invoice.client.name)},</p>
        <p>Your invoice is ready and attached to this email.</p>
        
        <div class="invoice-details">
          <p><strong>Invoice Number:</strong> ${escapeHtml(invoice.orderNumber)}</p>
          <p><strong>Date:</strong> ${escapeHtml(dateStr)}</p>
          ${invoice.dueDate ? `<p><strong>Due Date:</strong> ${escapeHtml(parseDate(invoice.dueDate)?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '')}</p>` : ''}
          <p><strong>Total Amount:</strong> ${escapeHtml(fmtCurrency(invoice.total, invoice.currency))}</p>
        </div>
        
        ${invoice.notes ? `<p style="margin-top: 20px;"><em>${escapeHtml(invoice.notes)}</em></p>` : ''}
        
        <p>If you have any questions, please don't hesitate to contact us.</p>
        
        <div class="footer">
          <p>This is an automated message from ${escapeHtml(senderName)}<br>
          ${escapeHtml(senderEmail)}${process.env.COMPANY_PHONE ? ' • ' + escapeHtml(process.env.COMPANY_PHONE) : ''}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const attachment = {
    name: `invoice-${invoice.orderNumber}.pdf`,
    content: pdfBuffer.toString('base64'),
    contentType: 'application/pdf',
  };

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: invoice.client.name }],
    subject,
    htmlContent,
    attachment: [attachment],
  };

  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(`Network error calling Brevo API: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
  }

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          const code = typeof obj.code === 'string' || typeof obj.code === 'number' ? String(obj.code) : 'unknown';
          const message = typeof obj.message === 'string' ? obj.message : text;
          throw new Error(`Brevo API error ${res.status}: code=${code} message=${message}`);
        }
        throw new Error(`Brevo API error ${res.status}: ${text}`);
      } catch {
        throw new Error(`Brevo API error ${res.status}: ${text}`);
      }
    } catch {
      throw new Error(`Brevo API error ${res.status} (failed to read response body)`);
    }
  }
}

/* ---------------------- Process wrapper ------------------------------ */
export async function processInvoice(invoice: InvoiceData, company: CompanyInfo): Promise<void> {
  try {
    console.log(`[Invoice] Generating invoice for order ${invoice.orderNumber}`);
    const pdfBuffer = await generateInvoicePDF(invoice, company);

    console.log(`[Invoice] Sending invoice email to ${invoice.client.email}`);
    await sendInvoiceEmail(invoice, pdfBuffer);

    console.log(`[Invoice] Invoice sent successfully for order ${invoice.orderNumber}`);
  } catch (error) {
    console.error('[Invoice] Error processing invoice:', error);
    throw error;
  }
}

/* ---------------------- Utilities ----------------------------------- */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}