import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Client from '@/models/Client';
import Order from '@/models/Order';
import mongoose, { PipelineStage } from 'mongoose';
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

interface Address {
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
}

interface AggregatedClient {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  address?: Address;
  orderCount: number;
  totalSpent: number;
}

interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  orderCount: number;
  totalSpent: number;
}

/**
 * Enhanced PDF Export with proper margins and multi-line text support
 * - All text wraps to show complete information
 * - Dynamic row heights based on content
 * - Better spacing and readability
 */

function escapeCsvCell(v: unknown) {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function formatCurrencyGBP(n: number) {
  return `£${Number(n || 0).toFixed(2)}`;
}

export async function GET(req: Request) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'pdf').toLowerCase();

    // Aggregate clients with order count and total spent
    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'orders',
          let: { clientId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$clientId', '$$clientId'] } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
          as: 'ordersAgg',
        },
      },
      {
        $addFields: {
          orderCount: { $ifNull: [{ $arrayElemAt: ['$ordersAgg.count', 0] }, 0] },
          totalSpent: { $ifNull: [{ $arrayElemAt: ['$ordersAgg.total', 0] }, 0] },
        },
      },
      { $project: { ordersAgg: 0 } },
      { $sort: { totalSpent: -1, updatedAt: -1 } },
    ];

    const clientsAgg: AggregatedClient[] = await Client.aggregate(pipeline).allowDiskUse(true).exec();

    const rows: ClientRow[] = clientsAgg.map((c: AggregatedClient) => {
      const addrParts: string[] = [];
      if (c.address?.line1) addrParts.push(c.address.line1);
      if (c.address?.unit) addrParts.push(c.address.unit);
      if (c.address?.city) addrParts.push(c.address.city);
      if (c.address?.postcode) addrParts.push(c.address.postcode);
      const address = addrParts.filter(Boolean).join(', ');
      return {
        id: (c._id || '').toString(),
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        address,
        orderCount: Number(c.orderCount || 0),
        totalSpent: Number(c.totalSpent || 0),
      };
    });

    if (format === 'json') {
      return NextResponse.json({ meta: { total: rows.length }, data: rows }, { status: 200 });
    }

    if (format === 'csv') {
      const header = ['clientId', 'clientName', 'clientEmail', 'clientPhone', 'clientAddress', 'orderCount', 'totalSpent'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [
            escapeCsvCell(r.id),
            escapeCsvCell(r.name),
            escapeCsvCell(r.email),
            escapeCsvCell(r.phone),
            escapeCsvCell(r.address),
            escapeCsvCell(r.orderCount),
            escapeCsvCell(r.totalSpent.toFixed(2)),
          ].join(',')
        );
      }
      const csv = lines.join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clients-summary.csv"`,
        },
      });
    }

    // ---------------- ENHANCED PDF WITH PROPER WRAPPING ----------------
    
    // Page constants (A4 landscape for more space)
    const PAGE_WIDTH = 841.89;  // A4 Landscape
    const PAGE_HEIGHT = 595.28;
    const MARGIN_LEFT = 50;
    const MARGIN_RIGHT = 50;
    const MARGIN_TOP = 80;
    const MARGIN_BOTTOM = 70;
    const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

    // Colors
    const colors = {
      headerBg: rgb(0.2, 0.35, 0.6),
      headerText: rgb(1, 1, 1),
      text: rgb(0.1, 0.1, 0.1),
      textLight: rgb(0.4, 0.4, 0.4),
      border: rgb(0.7, 0.7, 0.7),
      rowAlt: rgb(0.96, 0.96, 0.96),
      success: rgb(0.13, 0.59, 0.33),
    };

    // Column widths - more generous for text
    const colWidths = {
      name: 130,
      email: 150,
      phone: 100,
      address: 220,
      orders: 60,
      total: 80,
    };

    const CELL_PADDING = 8;
    const LINE_HEIGHT = 12;
    const MIN_ROW_HEIGHT = 35;

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Helper: wrap text to multiple lines
    function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
      if (!text) return [''];
      
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        
        if (width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          // Check if single word is too long
          if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
            // Break long word
            let remaining = word;
            while (remaining.length > 0) {
              let chunk = remaining;
              while (chunk.length > 0 && font.widthOfTextAtSize(chunk, fontSize) > maxWidth) {
                chunk = chunk.slice(0, -1);
              }
              if (chunk.length === 0) chunk = remaining[0];
              lines.push(chunk);
              remaining = remaining.slice(chunk.length);
            }
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      }
      
      if (currentLine) lines.push(currentLine);
      return lines.length > 0 ? lines : [''];
    }

    // Helper: calculate row height needed
    function calculateRowHeight(row: ClientRow, textSize: number): number {
      const nameLines = wrapText(row.name, colWidths.name - CELL_PADDING * 2, textSize, helvetica);
      const emailLines = wrapText(row.email, colWidths.email - CELL_PADDING * 2, textSize, helvetica);
      const phoneLines = wrapText(row.phone, colWidths.phone - CELL_PADDING * 2, textSize, helvetica);
      const addressLines = wrapText(row.address, colWidths.address - CELL_PADDING * 2, textSize, helvetica);
      
      const maxLines = Math.max(nameLines.length, emailLines.length, phoneLines.length, addressLines.length);
      return Math.max(MIN_ROW_HEIGHT, maxLines * LINE_HEIGHT + CELL_PADDING * 2);
    }

    // Helper: add new page
    function addPage(pageNum: number, totalPages: number): PDFPage {
      const page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const { width, height } = page.getSize();

      // Header background
      page.drawRectangle({
        x: 0,
        y: height - 60,
        width: width,
        height: 60,
        color: colors.headerBg,
      });

      // Title
      page.drawText('CLIENTS SUMMARY REPORT', {
        x: MARGIN_LEFT,
        y: height - 35,
        size: 18,
        font: helveticaBold,
        color: colors.headerText,
      });

      // Date
      const dateStr = new Date().toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      });
      page.drawText(dateStr, {
        x: MARGIN_LEFT,
        y: height - 50,
        size: 9,
        font: helvetica,
        color: colors.headerText,
      });

      // Page number
      const pageText = `Page ${pageNum} of ${totalPages}`;
      page.drawText(pageText, {
        x: width - MARGIN_RIGHT - helvetica.widthOfTextAtSize(pageText, 10),
        y: height - 40,
        size: 10,
        font: helvetica,
        color: colors.headerText,
      });

      return page;
    }

    // Helper: draw table header
    function drawTableHeader(page: PDFPage, y: number): number {
      const headerHeight = 30;
      
      // Header background
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: y - headerHeight,
        width: USABLE_WIDTH,
        height: headerHeight,
        color: colors.headerBg,
      });

      // Header text
      let x = MARGIN_LEFT + CELL_PADDING;
      const headerY = y - 19;
      
      page.drawText('Client Name', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });
      x += colWidths.name;
      
      page.drawText('Email Address', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });
      x += colWidths.email;
      
      page.drawText('Phone Number', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });
      x += colWidths.phone;
      
      page.drawText('Address', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });
      x += colWidths.address;
      
      page.drawText('Orders', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });
      x += colWidths.orders;
      
      page.drawText('Total Spent', { x, y: headerY, size: 10, font: helveticaBold, color: colors.headerText });

      return headerHeight;
    }

    // Calculate total pages needed
    let totalPagesEstimate = 1;
    let testY = PAGE_HEIGHT - MARGIN_TOP - 30;
    
    for (const row of rows) {
      const rowHeight = calculateRowHeight(row, 9);
      if (testY - rowHeight < MARGIN_BOTTOM) {
        totalPagesEstimate++;
        testY = PAGE_HEIGHT - MARGIN_TOP - 30;
      }
      testY -= rowHeight;
    }

    // Generate pages
    let page = addPage(1, totalPagesEstimate);
    let cursorY = PAGE_HEIGHT - MARGIN_TOP;
    
    // Draw header
    const headerHeight = drawTableHeader(page, cursorY);
    cursorY -= headerHeight;

    let pageNum = 1;
    let isAlt = false;

    for (const row of rows) {
      const textSize = 9;
      const rowHeight = calculateRowHeight(row, textSize);

      // New page if needed
      if (cursorY - rowHeight < MARGIN_BOTTOM) {
        pageNum++;
        page = addPage(pageNum, totalPagesEstimate);
        cursorY = PAGE_HEIGHT - MARGIN_TOP;
        const hh = drawTableHeader(page, cursorY);
        cursorY -= hh;
        isAlt = false;
      }

      // Alternating background
      if (isAlt) {
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: cursorY - rowHeight,
          width: USABLE_WIDTH,
          height: rowHeight,
          color: colors.rowAlt,
        });
      }

      // Border
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: cursorY - rowHeight,
        width: USABLE_WIDTH,
        height: rowHeight,
        borderColor: colors.border,
        borderWidth: 0.5,
      });

      // Draw wrapped text for each column
      let x = MARGIN_LEFT + CELL_PADDING;
      const startY = cursorY - CELL_PADDING - LINE_HEIGHT + 2;

      // Name
      const nameLines = wrapText(row.name, colWidths.name - CELL_PADDING * 2, textSize, helvetica);
      nameLines.forEach((line, i) => {
        page.drawText(line, {
          x,
          y: startY - i * LINE_HEIGHT,
          size: textSize,
          font: helveticaBold,
          color: colors.text,
        });
      });
      x += colWidths.name;

      // Email
      const emailLines = wrapText(row.email, colWidths.email - CELL_PADDING * 2, textSize, helvetica);
      emailLines.forEach((line, i) => {
        page.drawText(line, {
          x,
          y: startY - i * LINE_HEIGHT,
          size: textSize,
          font: helvetica,
          color: colors.textLight,
        });
      });
      x += colWidths.email;

      // Phone
      const phoneLines = wrapText(row.phone || '-', colWidths.phone - CELL_PADDING * 2, textSize, helvetica);
      phoneLines.forEach((line, i) => {
        page.drawText(line, {
          x,
          y: startY - i * LINE_HEIGHT,
          size: textSize,
          font: helvetica,
          color: colors.text,
        });
      });
      x += colWidths.phone;

      // Address
      const addressLines = wrapText(row.address || '-', colWidths.address - CELL_PADDING * 2, textSize, helvetica);
      addressLines.forEach((line, i) => {
        page.drawText(line, {
          x,
          y: startY - i * LINE_HEIGHT,
          size: textSize,
          font: helvetica,
          color: colors.textLight,
        });
      });
      x += colWidths.address;

      // Orders (centered)
      const ordersStr = String(row.orderCount);
      const ordersWidth = helvetica.widthOfTextAtSize(ordersStr, textSize);
      page.drawText(ordersStr, {
        x: x + (colWidths.orders - ordersWidth) / 2,
        y: startY,
        size: textSize,
        font: helveticaBold,
        color: colors.text,
      });
      x += colWidths.orders;

      // Total (right-aligned with padding)
      const totalStr = formatCurrencyGBP(row.totalSpent);
      const totalWidth = helveticaBold.widthOfTextAtSize(totalStr, textSize);
      page.drawText(totalStr, {
        x: x + colWidths.total - totalWidth - CELL_PADDING,
        y: startY,
        size: textSize,
        font: helveticaBold,
        color: colors.success,
      });

      // Column dividers
      let divX = MARGIN_LEFT + colWidths.name;
      [colWidths.email, colWidths.phone, colWidths.address, colWidths.orders].forEach(w => {
        page.drawLine({
          start: { x: divX, y: cursorY },
          end: { x: divX, y: cursorY - rowHeight },
          thickness: 0.5,
          color: colors.border,
        });
        divX += w;
      });

      cursorY -= rowHeight;
      isAlt = !isAlt;
    }

    // Footer summary
    const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    const footerY = MARGIN_BOTTOM - 30;

    // Summary box
    lastPage.drawRectangle({
      x: MARGIN_LEFT,
      y: footerY - 25,
      width: USABLE_WIDTH,
      height: 35,
      color: rgb(0.95, 0.97, 1),
      borderColor: colors.headerBg,
      borderWidth: 1.5,
    });

    lastPage.drawText(`Total Clients: ${rows.length}`, {
      x: MARGIN_LEFT + 15,
      y: footerY - 10,
      size: 11,
      font: helveticaBold,
      color: colors.text,
    });

    const grandTotal = rows.reduce((sum, r) => sum + r.totalSpent, 0);
    const totalText = `Grand Total: ${formatCurrencyGBP(grandTotal)}`;
    const totalWidth = helveticaBold.widthOfTextAtSize(totalText, 11);
    lastPage.drawText(totalText, {
      x: PAGE_WIDTH - MARGIN_RIGHT - totalWidth - 15,
      y: footerY - 10,
      size: 11,
      font: helveticaBold,
      color: colors.success,
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="clients-summary-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Failed to export clients summary:', err);
    return NextResponse.json({ error: 'Failed to export clients summary' }, { status: 500 });
  }
}