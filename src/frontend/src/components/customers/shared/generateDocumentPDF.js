import jsPDF, { GState } from 'jspdf';
import 'jspdf-autotable';
import { normalizeDocumentLines } from '../../../utils/lineItems';

/**
 * Professional Invoice / Quotation PDF generator.
 *
 * Modern, minimal, corporate layout:
 *  - A4 portrait, thin teal brand line across the very top
 *  - Company block top-left, document title + status badge top-right
 *  - Compact metadata card (number / date / due / terms) under the title
 *  - Light "BILL TO" / "DELIVERY / SERVICE ADDRESS" cards, teal headings
 *  - Grey-headed line-item table (# / Description / Qty / Price Each / Amount)
 *  - Notes + statement memo bottom-left, bordered Totals card bottom-right
 *  - Footer divider with centred muted message on every page
 *
 * All data flows in via `opts` — no business logic is changed here.
 */

// ── Design palette (restrained, financial-document friendly) ───────────────
const TEAL      = [20, 125, 115];   // #147D73
const MAIN      = [31, 41, 55];     // #1F2937
const SECONDARY = [107, 114, 128];  // #6B7280
const LIGHT_BG  = [248, 250, 250];  // #F8FAFA
const BORDER    = [209, 213, 219];  // #D1D5DB
const SOFT      = [229, 231, 235];  // #E5E7EB

// Mix a colour toward white by `amount` (0..1) → light tint for badge/card bg.
const tint = (rgb, amount) => rgb.map(c => Math.round(c + (255 - c) * amount));

/**
 * Reusable address formatter.
 *
 * Accepts either a structured object or a plain (possibly multi-line) string
 * and returns a clean array of lines:
 *   [address1, address2, suburb?, "City, Province PostalCode", country?]
 *
 * Key guarantee: a postal/ZIP code is never left on its own line — it is
 * merged onto the preceding "City, State/Province" line.
 *
 * @param {object|string} addr – e.g. { address1, address2, city, state,
 *   postal_code|postalCode|zip, country } or "Street\nCity, ST 12345"
 * @returns {string[]} cleaned, non-empty address lines
 */
export function formatAddress(addr) {
  const clean = (v) => String(v == null ? '' : v).trim();

  // ── Structured object (preferred) ──────────────────────────────────────
  if (addr && typeof addr === 'object') {
    const a1 = clean(addr.address1 || addr.address || addr.street || addr.street1 || addr.line1);
    const a2 = clean(addr.address2 || addr.suite || addr.line2);
    const suburb = clean(addr.suburb || addr.area || addr.neighborhood);
    const city = clean(addr.city || addr.town);
    const state = clean(addr.state || addr.province || addr.province_code || addr.region);
    const postal = clean(addr.postal_code || addr.postalCode || addr.zip || addr.postcode);
    const country = clean(addr.country);

    const csz = [city, state].filter(Boolean).join(', ');
    const cszLine = postal ? (csz ? `${csz} ${postal}` : postal) : csz;

    const lines = [];
    if (a1) lines.push(a1);
    if (a2) lines.push(a2);
    if (suburb) lines.push(suburb);
    if (cszLine) lines.push(cszLine);
    if (country) lines.push(country);
    return lines;
  }

  // ── Plain string ───────────────────────────────────────────────────────
  const rawLines = String(addr || '')
    .split(/\r?\n/)
    .map(l => clean(l).replace(/,\s*$/, ''))
    .filter(Boolean);

  const out = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const next = rawLines[i + 1];
    // If this line is a bare postal code and the previous line exists,
    // append it to the previous line (e.g. "Citty, CP" + "09674353").
    if (looksLikePostal(line) && out.length > 0 && !looksLikePostal(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out.filter(Boolean);
}

// Heuristic: is this line a bare postal/ZIP code?
function looksLikePostal(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^\d{3,10}$/.test(t)) return true;                                            // 7975 · 12345 · 09674353
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(t)) return true;                           // UK / CA postcodes
  if (t.length <= 10 && /[A-Za-z]/.test(t) && /\d/.test(t) && /^[\w\-\s]+$/.test(t)
      && !/\b(suite|floor|apt|unit|#)\b/i.test(t)) return true;                     // short alphanumeric codes
  return false;
}

// Subtle, professional status badge colours (fg colour per status).
const STATUS_COLORS = {
  'paid':              TEAL,
  'partially paid':    [37, 99, 235],
  'partial':           [37, 99, 235],
  'unpaid':            [180, 83, 9],
  'pending':           [180, 83, 9],
  'overdue':           [190, 18, 60],
  'sent':              [37, 99, 235],
  'accepted':          TEAL,
  'invoiced':          [37, 99, 235],
  'converted':         [114, 46, 209],
  'open':              TEAL,
  'draft':             [107, 114, 128],
  'expired':           [107, 114, 128],
  'declined':          [190, 18, 60],
  'cancelled':         [190, 18, 60],
  'canceled':          [190, 18, 60],
  'void':              [190, 18, 60],
  'voided':            [190, 18, 60],
};

const badgeColor = (status) => {
  const s = String(status || '').toLowerCase();
  return STATUS_COLORS[s] || [107, 114, 128];
};

// Only a FULLY PAID invoice gets a status stamp. Unpaid / partially paid /
// overdue invoices carry NO watermark, and quotes never get a payment stamp.
const VOID_LIKE = ['void', 'voided', 'cancelled', 'canceled', 'draft'];
function isFullyPaidInvoice({ docType, status, paidToDate, grandTotal }) {
  if (String(docType || '').toLowerCase() !== 'invoice') return false;
  const s = String(status || '').toLowerCase();
  if (VOID_LIKE.includes(s)) return false;
  if (s === 'paid') return true;
  const paid = Number(paidToDate) || 0;
  const total = Number(grandTotal) || 0;
  return total > 0 && paid >= total - 0.005;
}

/**
 * @param {object} opts
 * @param {'Invoice'|'Quote'} opts.docType
 * @param {object} opts.header – { number, status, date, dueDate, terms,
 *   customerName, email, billingAddress, shippingAddress? }
 * @param {Array}  opts.lines  – [{ description, quantity, rate, amount }]
 * @param {number} opts.subtotal / vatPercent / vatAmount / grandTotal
 * @param {string} opts.message / statementMemo
 * @param {object} opts.company – full company_info row (name, address fields,
 *   email, phone, logo) OR { name, address, email, phone, logo }
 * @param {string} opts.currencySymbol
 * @param {object} opts.templateSettings – labels / fonts / toggles
 * @returns {jsPDF}
 */
export function generateDocumentPDF({
  docType = 'Invoice',
  header = {},
  lines = [],
  subtotal = 0,
  vatPercent = 0,
  vatAmount = 0,
  grandTotal = 0,
  paidToDate = 0,
  message: docMessage = '',
  statementMemo = '',
  company = {},
  currencySymbol = '$',
  templateSettings = {},
}) {
  const T = {
    logoBase64: '',
    fontFamily: 'helvetica',
    headerFontSize: 20,
    bodyFontSize: 9.5,
    showLogo: true,
    showCompanyAddress: true,
    showCustomerEmail: true,
    showBillingAddress: true,
    showLineNumbers: true,
    showQuantity: true,
    showRate: true,
    footerText: 'Thank you for your business!',
    paymentInstructions: '',
    termsAndConditions: '',
    invoiceLabel: 'INVOICE',
    quoteLabel: 'QUOTE',
    billToLabel: 'BILL TO',
    shipToLabel: 'DELIVERY / SERVICE ADDRESS',
    dateLabel: 'DATE',
    invoiceNoLabel: 'INVOICE #',
    quoteNoLabel: 'QUOTE #',
    dueDateLabel: 'DUE DATE',
    validUntilLabel: 'VALID UNTIL',
    termsLabel: 'TERMS',
    notesLabel: 'NOTES',
    statementMemoLabel: 'STATEMENT MEMO',
    // Branding / topology (customizable)
    primaryColor: '#147D73',
    topBorderColor: '#147D73',
    headingColor: '#147D73',
    accentColor: '#f5f7fa',
    topBorderWidth: 3.5,
    titleAlign: 'right',
    headerLayout: 'side',
    cardStyle: 'cards',
    tableStyle: 'striped',
    ...templateSettings,
  };

  // Hex (#RRGGBB or #RGB) → [r, g, b]; falls back to the supplied default.
  const hexToRgb = (hex, fallback) => {
    if (!hex || typeof hex !== 'string') return fallback;
    const m = String(hex).replace('#', '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(m)) return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
    if (/^[0-9a-fA-F]{3}$/.test(m)) return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
    return fallback;
  };

  const primaryRgb  = hexToRgb(T.primaryColor, TEAL);
  const topColor    = hexToRgb(T.topBorderColor, primaryRgb);
  const headColor   = hexToRgb(T.headingColor, primaryRgb);
  const accentRgb   = hexToRgb(T.accentColor, LIGHT_BG);
  const topBorderWidth = Math.max(1.5, Math.min(10, Number(T.topBorderWidth) || 3.5));
  const titleAlign  = ['left', 'center', 'right'].includes(T.titleAlign) ? T.titleAlign : 'right';
  const headerLayout = T.headerLayout === 'stacked' ? 'stacked' : 'side';
  const cardStyle   = T.cardStyle === 'plain' ? 'plain' : 'cards';
  const tableTheme  = T.tableStyle === 'bordered' ? 'grid' : (T.tableStyle === 'minimal' ? 'plain' : 'striped');

  const font = T.fontFamily || 'helvetica';
  const bfs = Math.max(8, Math.min(12, Number(T.bodyFontSize) || 9.5));
  const titleSize = 28;
  const companySize = Math.max(16, Math.min(22, Number(T.headerFontSize) || 20));

  const logoSrc = (T.showLogo && (T.logoBase64 || company.logo)) || null;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297
  const margin = 14;
  const contentW = pageW - 2 * margin;

  const fmt = (n) => `${currencySymbol} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const wrapLines = (text, maxW) => {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(seg => {
      const w = doc.splitTextToSize(seg, maxW);
      (Array.isArray(w) ? w : [String(w)]).forEach(l => out.push(String(l)));
    });
    return out;
  };

  const footerMsg = T.footerText || 'Thank you for your business!';

  // Brand frame drawn on every page: top band + footer divider/message.
  const drawBrandFrame = () => {
    doc.setFillColor(...topColor);
    doc.rect(0, 0, pageW, topBorderWidth, 'F');
    doc.setDrawColor(...SOFT);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 15, pageW - margin, pageH - 15);
    doc.setFontSize(8);
    doc.setFont(font, 'normal');
    doc.setTextColor(...SECONDARY);
    doc.text(footerMsg, pageW / 2, pageH - 10, { align: 'center' });
  };

  // ── Helper: customer block lines (name bold, rest normal) ──────────────
  const customerLines = (name, email, address, opts) => {
    const out = [];
    if (name) out.push({ text: name, bold: true });
    if (opts.email && email) out.push({ text: String(email), bold: false });
    if (opts.address) {
      formatAddress(address).forEach(l => out.push({ text: l, bold: false }));
    }
    return out;
  };

  // ── Page 1: header ─────────────────────────────────────────────────────
  let y = 13;

  const docTitle = docType === 'Quote'
    ? (T.quoteLabel || 'QUOTE').toUpperCase()
    : (T.invoiceLabel || 'INVOICE').toUpperCase();

  const companyName = company.name || company.company_name || '';
  const stacked = headerLayout === 'stacked';

  let leftBottom;
  let titleX;
  let titleAlignOpt;
  let titleYPos;
  let badgeY;
  let leftX = margin;

  if (stacked) {
    // ── Centered header: logo / company centred at top, title below ──
    const cx = pageW / 2;
    let cy = y + 6;
    if (logoSrc) {
      try {
        const imgFmt = String(logoSrc).includes('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoSrc, imgFmt, cx - 10, cy, 20, 20);
        cy += 22;
      } catch { /* ignore a bad logo */ }
    }
    if (companyName) {
      doc.setFontSize(companySize);
      doc.setFont(font, 'bold');
      doc.setTextColor(...MAIN);
      doc.text(companyName, cx, cy, { align: 'center' });
      cy += 5.5;
    }
    if (T.showCompanyAddress) {
      const addrLines = formatAddress(company).slice(0, 2);
      doc.setFontSize(9);
      doc.setFont(font, 'normal');
      doc.setTextColor(...SECONDARY);
      addrLines.forEach(line => { doc.text(line, cx, cy, { align: 'center' }); cy += 4.4; });
      const cParts = [company.email, company.phone].filter(Boolean);
      if (cParts.length) {
        doc.setFont(font, 'bold');
        doc.setTextColor(...SECONDARY);
        doc.text(cParts.join('  |  '), cx, cy, { align: 'center' });
        cy += 4.4;
        doc.setFont(font, 'normal');
      }
    }
    titleX = cx;
    titleAlignOpt = 'center';
    titleYPos = cy + 3;
    badgeY = titleYPos + 6;
    leftBottom = badgeY + 6;
  } else {
    // ── Side-by-side header: company left, title right ──
    if (logoSrc) {
      try {
        const imgFmt = String(logoSrc).includes('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoSrc, imgFmt, margin, y, 20, 20);
        leftX = margin + 26;
      } catch { /* ignore a bad logo */ }
    }
    if (companyName) {
      doc.setFontSize(companySize);
      doc.setFont(font, 'bold');
      doc.setTextColor(...MAIN);
      doc.text(companyName, leftX, y + 8);
    }
    let compLineY = y + (companyName ? 12 : 2);
    doc.setFontSize(9.5);
    doc.setFont(font, 'normal');
    doc.setTextColor(...SECONDARY);
    if (T.showCompanyAddress) {
      formatAddress(company).forEach(line => {
        doc.text(line, leftX, compLineY);
        compLineY += 4.6;
      });
      const cParts = [company.email, company.phone].filter(Boolean);
      if (cParts.length) {
        doc.setFont(font, 'bold');
        doc.setTextColor(...SECONDARY);
        doc.text(cParts.join('  |  '), leftX, compLineY);
        compLineY += 4.6;
        doc.setFont(font, 'normal');
      }
    }
    leftBottom = compLineY;
    titleX = titleAlign === 'left' ? margin : (titleAlign === 'center' ? pageW / 2 : pageW - margin);
    titleAlignOpt = titleAlign;
    titleYPos = y + 9;
    badgeY = y + 14;
  }

  // Title + status badge
  doc.setFontSize(titleSize);
  doc.setFont(font, 'bold');
  doc.setTextColor(...MAIN);
  doc.text(docTitle, titleX, titleYPos, { align: titleAlignOpt });

  const statusText = String(header.status || '').toUpperCase();
  let badgeBottom = badgeY;
  if (statusText) {
    const color = badgeColor(header.status);
    doc.setFontSize(8.5);
    doc.setFont(font, 'bold');
    const bw = doc.getTextWidth(statusText) + 9;
    const bh = 6.5;
    let bx;
    if (titleAlignOpt === 'center') bx = titleX - bw / 2;
    else if (titleAlignOpt === 'left') bx = titleX;
    else bx = titleX - bw;
    doc.setFillColor(...tint(color, 0.86));
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.roundedRect(bx, badgeY, bw, bh, 3.2, 3.2, 'FD');
    doc.setTextColor(...color);
    doc.text(statusText, bx + bw / 2, badgeY + bh / 2 + 0.4, { align: 'center' });
    badgeBottom = badgeY + bh;
  }

  // Compact metadata card (right-anchored, independent of title alignment)
  const metaRows = [];
  const numLabel = docType === 'Quote' ? (T.quoteNoLabel || 'QUOTE #') : (T.invoiceNoLabel || 'INVOICE #');
  if (header.number) metaRows.push([numLabel.toUpperCase(), String(header.number)]);
  if (header.date) metaRows.push([(T.dateLabel || 'DATE').toUpperCase(), String(header.date)]);
  const dueLabel = docType === 'Quote' ? (T.validUntilLabel || 'VALID UNTIL') : (T.dueDateLabel || 'DUE DATE');
  if (header.dueDate) metaRows.push([dueLabel.toUpperCase(), String(header.dueDate)]);
  if (header.terms) metaRows.push([(T.termsLabel || 'TERMS').toUpperCase(), String(header.terms)]);

  const metaW = 80;
  const metaX = pageW - margin - metaW;
  const metaRowH = 6.4;
  const metaH = metaRows.length * metaRowH + 9;
  const metaY = badgeBottom + 6;
  if (metaRows.length) {
    doc.setFillColor(...accentRgb);
    doc.setDrawColor(...SOFT);
    doc.setLineWidth(0.3);
    doc.roundedRect(metaX, metaY, metaW, metaH, 3, 3, 'FD');
    metaRows.forEach((row, i) => {
      const ry = metaY + 5 + i * metaRowH;
      doc.setFontSize(8);
      doc.setFont(font, 'bold');
      doc.setTextColor(...SECONDARY);
      doc.text(row[0], metaX + 6, ry);
      doc.setFontSize(9);
      doc.setFont(font, 'normal');
      doc.setTextColor(...MAIN);
      doc.text(row[1], metaX + metaW - 6, ry, { align: 'right' });
      // Clean horizontal row separator (sits below the text of each row).
      if (i < metaRows.length - 1) {
        doc.setDrawColor(...SOFT);
        doc.setLineWidth(0.2);
        doc.line(metaX, ry + 2, metaX + metaW, ry + 2);
      }
    });
  }
  const rightBottom = metaRows.length ? metaY + metaH : badgeBottom;

  // Thin header separator
  y = Math.max(leftBottom, rightBottom) + 6;
  doc.setDrawColor(...SOFT);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 9;

  // ── BILL TO / SHIP TO cards ────────────────────────────────────────────
  const cardGap = 8;
  const cardW = (contentW - cardGap) / 2;

  const billLines = customerLines(header.customerName, header.email, header.billingAddress, {
    email: T.showCustomerEmail,
    address: T.showBillingAddress,
  });
  // The app has no dedicated shipping field for invoices/quotes — mirror the
  // billing address so the card structure stays consistent (matches existing
  // behaviour). If a caller ever provides a real shipping address it is used.
  const shipAddress = header.shippingAddress || header.billingAddress;
  const shipLines = customerLines(header.customerName, '', shipAddress, { email: false, address: true });

  const maxCardLines = Math.max(billLines.length, shipLines.length, 1);
  const cardH = 13 + maxCardLines * 4.6 + 7;

  const drawCard = (x, w, label, contentLines) => {
    if (cardStyle === 'plain') {
      doc.setFontSize(8.5);
      doc.setFont(font, 'bold');
      doc.setTextColor(...headColor);
      doc.text(label.toUpperCase(), x + 1, y + 7);
      let ly = y + 12;
      contentLines.forEach(l => {
        doc.setFontSize(9.5);
        doc.setFont(font, l.bold ? 'bold' : 'normal');
        doc.setTextColor(...(l.bold ? MAIN : SECONDARY));
        doc.text(l.text, x + 1, ly);
        ly += 4.6;
      });
    } else {
      doc.setFillColor(...accentRgb);
      doc.setDrawColor(...SOFT);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, w, cardH, 3, 3, 'FD');
      doc.setFontSize(8.5);
      doc.setFont(font, 'bold');
      doc.setTextColor(...headColor);
      doc.text(label.toUpperCase(), x + 6, y + 7);
      doc.setDrawColor(...SOFT);
      doc.setLineWidth(0.3);
      doc.line(x + 6, y + 10, x + w - 6, y + 10);
      let ly = y + 15;
      contentLines.forEach(l => {
        doc.setFontSize(9.5);
        doc.setFont(font, l.bold ? 'bold' : 'normal');
        doc.setTextColor(...(l.bold ? MAIN : SECONDARY));
        doc.text(l.text, x + 6, ly);
        ly += 4.6;
      });
    }
  };

  drawCard(margin, cardW, T.billToLabel || 'BILL TO', billLines);
  drawCard(margin + cardW + cardGap, cardW, T.shipToLabel || 'SHIP TO', shipLines);
  y += cardH + 10;

  // ── Line-item table ────────────────────────────────────────────────────
  // Drop empty convenience rows here, in ONE place, so Preview / Download /
  // Print / email-attachment PDFs all agree — and so legacy documents that
  // already hold a stray blank line never print one. Numbering is applied
  // AFTER filtering, so it stays sequential (1, 2, 3 …).
  const cleanLines = normalizeDocumentLines(lines);

  const colHeaders = [];
  const colAlign = [];
  const colWidth = [];
  if (T.showLineNumbers) { colHeaders.push('#');          colAlign.push('center'); colWidth.push(10); }
  const descIdx = colHeaders.length;
  colHeaders.push('Description'); colAlign.push('left'); colWidth.push(0);
  if (T.showQuantity) { colHeaders.push('Qty');           colAlign.push('center'); colWidth.push(20); }
  if (T.showRate)     { colHeaders.push('Price Each');    colAlign.push('right');  colWidth.push(36); }
  colHeaders.push('Amount'); colAlign.push('right'); colWidth.push(40);

  const fixedW = colWidth.reduce((a, b) => a + b, 0);
  colWidth[descIdx] = Math.max(70, contentW - (fixedW - colWidth[descIdx]));

  const colStyles = {};
  colHeaders.forEach((_, i) => { colStyles[i] = { cellWidth: colWidth[i], halign: colAlign[i] }; });

  const tableBody = cleanLines.map((l, i) => {
    const row = [];
    if (T.showLineNumbers) row.push(i + 1);
    row.push(l.description || '');
    if (T.showQuantity) {
      const q = Number(l.quantity || 0);
      row.push(Number.isInteger(q) ? q : q.toFixed(2));
    }
    if (T.showRate) row.push(fmt(l.rate));
    row.push(fmt(l.amount));
    return row;
  });

  doc.autoTable({
    startY: y,
    head: [colHeaders],
    body: tableBody,
    margin: { left: margin, right: margin },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: tableTheme,
    styles: {
      fontSize: 8.8,
      cellPadding: 2.8,
      textColor: MAIN,
      lineColor: SOFT,
      lineWidth: 0.2,
      font,
    },
    headStyles: {
      fillColor: accentRgb,
      textColor: MAIN,
      fontStyle: 'bold',
      fontSize: 8.8,
      lineColor: SOFT,
      lineWidth: 0.2,
    },
    columnStyles: colStyles,
    didDrawPage: () => drawBrandFrame(),
  });

  const tableTop = y;
  const tableBottom = doc.lastAutoTable.finalY;

  // ── Paid stamp: only for a fully paid invoice, angled so it rises from
  // lower-left to upper-right, with the actual paid date. Drawn as an overlay
  // so it never affects the invoice layout.
  const fullyPaid = isFullyPaidInvoice({ docType, status: header.status, paidToDate, grandTotal });
  if (fullyPaid && doc.getNumberOfPages() === 1) {
    const cx = pageW / 2;
    const cy = tableTop + (tableBottom - tableTop) / 2;
    const stampDate = header.paidDate ? String(header.paidDate) : '';
    const angle = 18; // positive → rises lower-left to upper-right
    doc.saveGraphicsState();
    try { doc.setGState(new GState({ opacity: 0.4 })); } catch { /* unsupported */ }
    doc.setTextColor(...TEAL);
    doc.setFont(font, 'bold');
    doc.setFontSize(38);
    doc.text('PAID', cx, cy, { angle, align: 'center' });
    if (stampDate) {
      doc.setFontSize(11);
      doc.text(stampDate, cx, cy + 20, { angle, align: 'center' });
    }
    doc.restoreGraphicsState();
  }

  // ── Notes + statement memo + totals ────────────────────────────────────
  const notesText = [docMessage, T.paymentInstructions].filter(Boolean).join('\n\n');
  const notesLines = notesText ? wrapLines(notesText, contentW - 96) : [];
  const memoLines = statementMemo ? wrapLines(statementMemo, contentW - 96) : [];
  const tAndCLines = T.termsAndConditions ? wrapLines(T.termsAndConditions, contentW - 96) : [];

  const totalRows = [['Subtotal', fmt(subtotal)]];
  if (vatPercent > 0) totalRows.push([`Tax (${vatPercent}%)`, fmt(vatAmount)]);
  else if (vatAmount > 0) totalRows.push(['Tax', fmt(vatAmount)]);
  totalRows.push(['TOTAL', fmt(grandTotal)]);
  // For invoices with partial payment, surface Paid to Date and the outstanding
  // balance so the document reflects what's still owed.
  const isInvoice = String(docType).toLowerCase() === 'invoice';
  const paid = Number(paidToDate) || 0;
  if (isInvoice && paid > 0) {
    totalRows.push(['PAID TO DATE', fmt(paid)]);
    totalRows.push(['BALANCE DUE', fmt(Math.max(0, grandTotal - paid))]);
  }

  const totalsW = 78;
  const totalsX = pageW - margin - totalsW;
  const valX = totalsX + totalsW;
  const hasLead = totalRows.length > 1;
  const gapBeforeTotal = 4;
  const totalsBoxH = 12
    + totalRows.reduce((s, r) => s + (r[0] === 'TOTAL' ? 8 : 6.2), 0)
    + (hasLead ? gapBeforeTotal : 0);

  const notesBlockH = (notesLines.length ? 5 + notesLines.length * 4.4 : 0)
    + (memoLines.length ? 5 + memoLines.length * 4.4 : 0)
    + (tAndCLines.length ? 5 + tAndCLines.length * 4.4 : 0);
  const blockHeight = Math.max(notesBlockH, totalsBoxH) + 4;

  // Sit the NOTES / totals block low on the page (near the footer) while
  // keeping a comfortable gap below the table.
  const footerZone = 17;
  y = Math.max(pageH - footerZone - blockHeight, tableBottom + 8);
  if (y + blockHeight > pageH - footerZone) {
    doc.addPage();
    drawBrandFrame();
    y = 16;
  }

  // Totals card (bottom-right)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsX, y, totalsW, totalsBoxH, 3, 3, 'FD');

  let ty = y + 8;
  totalRows.forEach((row) => {
    const isTotal = row[0] === 'TOTAL' || row[0] === 'BALANCE DUE';
    if (isTotal && hasLead) {
      ty += gapBeforeTotal; // breathing room before the TOTAL rule
      doc.setDrawColor(...SOFT);
      doc.setLineWidth(0.3);
      doc.line(totalsX + 6, ty - 4.5, valX - 6, ty - 4.5);
    }
    doc.setFontSize(isTotal ? 11 : 9.5);
    doc.setFont(font, isTotal ? 'bold' : 'normal');
    doc.setTextColor(...MAIN);
    doc.text(row[0], totalsX + 6, ty);
    doc.text(String(row[1]), valX - 6, ty, { align: 'right' });
    ty += isTotal ? 8 : 6.2;
  });

  // Notes block (bottom-left, beside the totals card)
  const notesX = margin;
  const notesW = contentW - totalsW - 12;
  const section = (label, contentLines) => {
    doc.setFontSize(8.5);
    doc.setFont(font, 'bold');
    doc.setTextColor(...headColor);
    doc.text(label, notesX, y + 1);
    y += 5;
    doc.setFontSize(9.5);
    doc.setFont(font, 'normal');
    doc.setTextColor(...SECONDARY);
    doc.text(contentLines, notesX, y + 1);
    y += contentLines.length * 4.4 + 5;
  };
  if (notesLines.length) section((T.notesLabel || 'NOTES').toUpperCase(), notesLines);
  if (memoLines.length) section((T.statementMemoLabel || 'STATEMENT MEMO').toUpperCase(), memoLines);
  if (tAndCLines.length) section(`${(T.termsLabel || 'TERMS').toUpperCase()} & CONDITIONS`, tAndCLines);

  drawBrandFrame();

  return doc;
}

/**
 * Produce the PDF and perform the requested action.
 * @param {'download'|'preview'|'print'} action
 * @param {object} opts – same shape as generateDocumentPDF
 */
export function handleDocumentPDF(action, opts) {
  const doc = generateDocumentPDF(opts);
  const fileName = `${opts.docType || 'Document'}_${opts.header?.number || 'draft'}.pdf`;

  if (action === 'download') {
    doc.save(fileName);
  } else if (action === 'print') {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    // Off-screen but still rendered — `display:none` can stop the embedded
    // PDF viewer from loading, which is why print() previously produced nothing.
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        // Fallback: open the PDF so the user can print it directly.
        try { window.open(url, '_blank'); } catch (_) { /* ignore */ }
      }
      // Keep the iframe alive long enough for the print dialog to read it.
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
        URL.revokeObjectURL(url);
      }, 60000);
    };
    // Wait for the PDF to actually load before invoking print.
    iframe.onload = () => setTimeout(triggerPrint, 350);
    iframe.src = url;
    document.body.appendChild(iframe);
    // Fallback in case the embedded viewer never fires onload.
    setTimeout(triggerPrint, 1500);
  } else {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}
