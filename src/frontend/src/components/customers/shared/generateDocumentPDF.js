import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Generate a professional PDF for an invoice or quote.
 * @param {object} opts
 * @param {'Invoice'|'Quote'} opts.docType
 * @param {object} opts.header        – { number, status, date, dueDate, terms, customerName, email, billingAddress }
 * @param {Array}  opts.lines         – [{ description, quantity, rate, amount }]
 * @param {number} opts.subtotal
 * @param {number} opts.vatPercent
 * @param {number} opts.vatAmount
 * @param {number} opts.grandTotal
 * @param {string} opts.message       – message on document
 * @param {string} opts.statementMemo
 * @param {object} opts.company       – { name, email, phone, address, logo (base64) }
 * @returns {jsPDF} doc instance
 */
// ── Parse a hex colour string (#rrggbb) → [r, g, b] ────────────────────────
function hexToRgb(hex) {
  try {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  } catch { return null; }
}

export function generateDocumentPDF({
  docType = 'Invoice',
  header = {},
  lines = [],
  subtotal = 0,
  vatPercent = 0,
  vatAmount = 0,
  grandTotal = 0,
  message: docMessage = '',
  statementMemo = '',
  company = {},
  currencySymbol = '$',
  templateSettings = {},
}) {
  // ── Resolve template settings with defaults ──────────────────────────────
  const T = {
    logoBase64: '',
    primaryColor: '#2962FF',
    accentColor: '#f5f7fa',
    fontFamily: 'helvetica',
    headerFontSize: 18,
    bodyFontSize: 9,
    showLogo: true,
    showCompanyAddress: true,
    showCustomerEmail: true,
    showBillingAddress: true,
    showLineNumbers: true,
    showQuantity: true,
    showRate: true,
    showTax: true,
    footerText: 'Thank you for your business!',
    paymentInstructions: '',
    termsAndConditions: '',
    invoiceLabel: 'INVOICE',
    quoteLabel: 'QUOTE',
    billToLabel: 'BILL TO',
    dateLabel: 'DATE',
    dueDateLabel: 'DUE DATE',
    termsLabel: 'TERMS',
    notesLabel: 'NOTES',
    ...templateSettings,
  };

  const font = T.fontFamily || 'helvetica';
  const primary  = hexToRgb(T.primaryColor)  || [41, 98, 255];
  const altRowBg = hexToRgb(T.accentColor)   || [245, 247, 250];
  const darkGrey = [51, 51, 51];
  const midGrey  = [120, 120, 120];

  // Use uploaded logo from template if available, fall back to company logo
  const logoSrc = (T.showLogo && (T.logoBase64 || company.logo)) || null;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Helper ──
  const fmt = (n) => `${currencySymbol} ${Number(n || 0).toFixed(2)}`;
  const hfs = Math.max(10, Math.min(28, Number(T.headerFontSize) || 18));
  const bfs = Math.max(7, Math.min(14, Number(T.bodyFontSize) || 9));

  // ═══════════════════  HEADER BAR  ═══════════════════
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');

  // Logo
  let logoX = margin;
  if (logoSrc) {
    try {
      const fmt2 = logoSrc.includes('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoSrc, fmt2, margin, 6, 26, 26);
      logoX = margin + 30;
    } catch { /* ignore bad logo */ }
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(hfs);
  doc.setFont(font, 'bold');
  doc.text(company.name || 'Your Company', logoX, 16);

  // Company contact line
  if (T.showCompanyAddress) {
    doc.setFontSize(bfs);
    doc.setFont(font, 'normal');
    const contactParts = [company.email, company.phone, company.address].filter(Boolean);
    if (contactParts.length) doc.text(contactParts.join('  |  '), logoX, 23);
  }

  // Document title right-aligned
  const docLabel = docType === 'Quote'
    ? (T.quoteLabel || 'QUOTE').toUpperCase()
    : (T.invoiceLabel || 'INVOICE').toUpperCase();
  doc.setFontSize(22);
  doc.setFont(font, 'bold');
  doc.text(docLabel, pageW - margin, 18, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont(font, 'normal');
  doc.text(`#${header.number || '—'}`, pageW - margin, 26, { align: 'right' });

  y = 48;

  // ═══════════════════  INFO SECTION  ═══════════════════
  doc.setTextColor(...darkGrey);

  // Left – Bill To
  doc.setFontSize(bfs - 1);
  doc.setFont(font, 'bold');
  doc.setTextColor(...midGrey);
  doc.text((T.billToLabel || 'BILL TO').toUpperCase(), margin, y);
  y += 5;
  doc.setFontSize(bfs + 2);
  doc.setFont(font, 'bold');
  doc.setTextColor(...darkGrey);
  doc.text(header.customerName || '—', margin, y);
  y += 5;
  doc.setFontSize(bfs);
  doc.setFont(font, 'normal');
  if (T.showCustomerEmail && header.email) { doc.text(header.email, margin, y); y += 4; }
  if (T.showBillingAddress && header.billingAddress) {
    const addrLines = doc.splitTextToSize(header.billingAddress, 80);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 4;
  }

  // Right – Details
  const rightX = pageW - margin;
  let ry = 48;
  const addDetail = (label, value) => {
    if (!value) return;
    doc.setFontSize(bfs - 1);
    doc.setFont(font, 'bold');
    doc.setTextColor(...midGrey);
    doc.text(label.toUpperCase(), rightX - 55, ry);
    doc.setFontSize(bfs);
    doc.setFont(font, 'normal');
    doc.setTextColor(...darkGrey);
    doc.text(String(value), rightX, ry, { align: 'right' });
    ry += 6;
  };

  addDetail(T.dateLabel || 'DATE', header.date);
  addDetail(docType === 'Quote' ? 'EXPIRY' : (T.dueDateLabel || 'DUE DATE'), header.dueDate);
  if (header.terms) addDetail(T.termsLabel || 'TERMS', header.terms);
  addDetail('STATUS', header.status);

  y = Math.max(y, ry) + 8;

  // ═══════════════════  LINE ITEMS TABLE  ═══════════════════
  // Build columns dynamically based on visibility toggles
  const colHeaders = ['Description'];
  const colStyles = { 0: {} };
  let colIdx = 1;
  if (T.showLineNumbers)  { colHeaders.unshift('#'); colStyles[0] = { cellWidth: 10, halign: 'center' }; colIdx++; }
  if (T.showQuantity)     { colHeaders.push('Qty');    colStyles[colIdx] = { cellWidth: 18, halign: 'center' }; colIdx++; }
  if (T.showRate)         { colHeaders.push('Rate');   colStyles[colIdx] = { cellWidth: 28, halign: 'right' }; colIdx++; }
  colHeaders.push('Amount');
  colStyles[colIdx] = { cellWidth: 30, halign: 'right' };

  const tableBody = lines.map((l, i) => {
    const row = [];
    if (T.showLineNumbers) row.push(i + 1);
    row.push(l.description || '');
    if (T.showQuantity) row.push(l.quantity || 0);
    if (T.showRate)     row.push(fmt(l.rate));
    row.push(fmt(l.amount));
    return row;
  });

  doc.autoTable({
    startY: y,
    head: [colHeaders],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: { fontSize: bfs, cellPadding: 3, textColor: darkGrey, lineColor: [220, 220, 220], lineWidth: 0.2, font },
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: bfs },
    alternateRowStyles: { fillColor: altRowBg },
    columnStyles: colStyles,
  });

  y = doc.lastAutoTable.finalY + 6;

  // ═══════════════════  TOTALS  ═══════════════════
  const totalsX = pageW - margin - 60;
  const valX = pageW - margin;

  const drawTotalLine = (label, value, bold) => {
    doc.setFont(font, bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? bfs + 2 : bfs);
    doc.setTextColor(...darkGrey);
    doc.text(label, totalsX, y);
    doc.text(value, valX, y, { align: 'right' });
    y += bold ? 7 : 5;
  };

  drawTotalLine('Subtotal', fmt(subtotal), false);
  if (vatPercent > 0) drawTotalLine(`Tax (${vatPercent}%)`, fmt(vatAmount), false);
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 1, valX, y - 1);
  y += 2;
  drawTotalLine('TOTAL', fmt(grandTotal), true);

  // ═══════════════════  NOTES  ═══════════════════
  y += 6;
  const notesLabel = (T.notesLabel || 'NOTES').toUpperCase();
  const combinedMessage = [docMessage, T.paymentInstructions].filter(Boolean).join('\n\n');
  if (combinedMessage) {
    doc.setFontSize(bfs - 1);
    doc.setFont(font, 'bold');
    doc.setTextColor(...midGrey);
    doc.text(notesLabel, margin, y);
    y += 4;
    doc.setFontSize(bfs);
    doc.setFont(font, 'normal');
    doc.setTextColor(...darkGrey);
    const msgLines = doc.splitTextToSize(combinedMessage, pageW - 2 * margin);
    doc.text(msgLines, margin, y);
    y += msgLines.length * 4 + 4;
  }
  if (statementMemo) {
    doc.setFontSize(bfs - 1);
    doc.setFont(font, 'bold');
    doc.setTextColor(...midGrey);
    doc.text('STATEMENT MEMO', margin, y);
    y += 4;
    doc.setFontSize(bfs);
    doc.setFont(font, 'normal');
    doc.setTextColor(...darkGrey);
    const memoLines = doc.splitTextToSize(statementMemo, pageW - 2 * margin);
    doc.text(memoLines, margin, y);
    y += memoLines.length * 4 + 4;
  }
  if (T.termsAndConditions) {
    doc.setFontSize(bfs - 1);
    doc.setFont(font, 'bold');
    doc.setTextColor(...midGrey);
    doc.text((T.termsLabel || 'TERMS').toUpperCase() + ' & CONDITIONS', margin, y);
    y += 4;
    doc.setFontSize(bfs);
    doc.setFont(font, 'normal');
    doc.setTextColor(...darkGrey);
    const tLines = doc.splitTextToSize(T.termsAndConditions, pageW - 2 * margin);
    doc.text(tLines, margin, y);
  }

  // ═══════════════════  FOOTER  ═══════════════════
  const pageH = doc.internal.pageSize.getHeight();
  const footerMsg = T.footerText || 'Thank you for your business!';
  doc.setFontSize(bfs - 1);
  doc.setTextColor(...midGrey);
  doc.text(footerMsg, pageW / 2, pageH - 10, { align: 'center' });

  return doc;
}

/**
 * Gather form / state data and produce the PDF, then perform the requested action.
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
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 5000);
  } else {
    // preview – open in new tab
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}
