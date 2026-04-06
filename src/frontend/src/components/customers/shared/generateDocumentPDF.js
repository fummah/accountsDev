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
  currencySymbol = 'R',
}) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Colours ──
  const primary = [41, 98, 255];   // brand blue
  const darkGrey = [51, 51, 51];
  const midGrey = [120, 120, 120];
  const lightBg = [245, 247, 250];

  // ── Helper ──
  const fmt = (n) => `${currencySymbol} ${Number(n || 0).toFixed(2)}`;

  // ═══════════════════  HEADER BAR  ═══════════════════
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');

  // Company logo (if base64 provided)
  let logoX = margin;
  if (company.logo) {
    try {
      doc.addImage(company.logo, 'PNG', margin, 6, 26, 26);
      logoX = margin + 30;
    } catch { /* ignore bad logo */ }
  }

  // Company name in header
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name || 'Your Company', logoX, 16);

  // Company contact
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const contactParts = [company.email, company.phone, company.address].filter(Boolean);
  if (contactParts.length) {
    doc.text(contactParts.join('  |  '), logoX, 23);
  }

  // Document title on right side of header
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(docType.toUpperCase(), pageW - margin, 18, { align: 'right' });

  // Document number below title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${header.number || '—'}`, pageW - margin, 26, { align: 'right' });

  y = 48;

  // ═══════════════════  INFO SECTION  ═══════════════════
  doc.setTextColor(...darkGrey);

  // Left column – Bill To
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...midGrey);
  doc.text('BILL TO', margin, y);
  y += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkGrey);
  doc.text(header.customerName || '—', margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (header.email) { doc.text(header.email, margin, y); y += 4; }
  if (header.billingAddress) {
    const addrLines = doc.splitTextToSize(header.billingAddress, 80);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 4;
  }

  // Right column – Details
  const rightX = pageW - margin;
  let ry = 48;
  const addDetail = (label, value) => {
    if (!value) return;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...midGrey);
    doc.text(label, rightX - 55, ry);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGrey);
    doc.text(String(value), rightX, ry, { align: 'right' });
    ry += 6;
  };

  addDetail('DATE', header.date);
  addDetail(docType === 'Quote' ? 'EXPIRY' : 'DUE DATE', header.dueDate);
  if (header.terms) addDetail('TERMS', header.terms);
  addDetail('STATUS', header.status);

  y = Math.max(y, ry) + 8;

  // ═══════════════════  LINE ITEMS TABLE  ═══════════════════
  const tableBody = lines.map((l, i) => [
    i + 1,
    l.description || '',
    l.quantity || 0,
    fmt(l.rate),
    fmt(l.amount),
  ]);

  doc.autoTable({
    startY: y,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: darkGrey,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: lightBg },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ═══════════════════  TOTALS  ═══════════════════
  const totalsX = pageW - margin - 60;
  const valX = pageW - margin;

  const drawTotalLine = (label, value, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(...darkGrey);
    doc.text(label, totalsX, y);
    doc.text(value, valX, y, { align: 'right' });
    y += bold ? 7 : 5;
  };

  drawTotalLine('Subtotal', fmt(subtotal), false);
  if (vatPercent > 0) {
    drawTotalLine(`VAT (${vatPercent}%)`, fmt(vatAmount), false);
  }
  // Divider line above total
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 1, valX, y - 1);
  y += 2;
  drawTotalLine('TOTAL', fmt(grandTotal), true);

  // ═══════════════════  NOTES  ═══════════════════
  y += 6;
  if (docMessage) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...midGrey);
    doc.text('NOTES', margin, y);
    y += 4;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGrey);
    const msgLines = doc.splitTextToSize(docMessage, pageW - 2 * margin);
    doc.text(msgLines, margin, y);
    y += msgLines.length * 4 + 4;
  }
  if (statementMemo) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...midGrey);
    doc.text('STATEMENT MEMO', margin, y);
    y += 4;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGrey);
    const memoLines = doc.splitTextToSize(statementMemo, pageW - 2 * margin);
    doc.text(memoLines, margin, y);
  }

  // ═══════════════════  FOOTER  ═══════════════════
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...midGrey);
  doc.text('Thank you for your business!', pageW / 2, pageH - 10, { align: 'center' });

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
