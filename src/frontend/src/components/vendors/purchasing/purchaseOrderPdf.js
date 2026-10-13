import { generateDocumentPDF } from '../../customers/shared/generateDocumentPDF';
import { getCustomerName } from '../../../utils/contactIdentity';
import { formatAddressLines } from '../../../utils/address';
import { getCurrencySymbol } from '../../../utils/currency';

/**
 * ONE Purchase Order document renderer.
 *
 * Used by BOTH the PO Print/Preview AND the PO email PDF attachment, so the
 * emailed PO is byte-for-byte the same document as the printed one (same
 * authoritative data, same jsPDF engine as invoices/quotes — never a second,
 * inconsistent PO template).
 *
 * The vendor name follows the shared identity rule (person → company → display)
 * via getCustomerName, so a company-only vendor is never blank.
 */
export function buildPurchaseOrderOpts(po = {}, { company = {}, vendor = null, templateSettings = {}, currencySymbol } = {}) {
  const sym = currencySymbol || getCurrencySymbol();
  const vendorName = (vendor ? getCustomerName(vendor) : '') || po.vendor_name || '';
  const vendorAddress = vendor ? formatAddressLines(vendor).join('\n') : (po.vendor_address || '');

  const lines = (po.lines || []).map(l => ({
    description: l.description || l.item_name || '',
    quantity: Number(l.qty_ordered) || 0,
    rate: Number(l.unit_cost) || 0,
    amount: Number(l.amount) || (Number(l.qty_ordered || 0) * Number(l.unit_cost || 0)),
  }));
  const subtotal = Number(po.subtotal) || lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const taxTotal = Number(po.tax_total) || 0;
  const total = Number(po.total) || (subtotal + taxTotal);
  const vatPercent = subtotal > 0 ? (taxTotal / subtotal) * 100 : 0;

  return {
    docType: 'Purchase Order',
    header: {
      number: po.po_number || '',
      status: String(po.status || '').toUpperCase(),
      date: po.po_date || '',
      dueDate: po.expected_date || '',
      terms: po.terms || '',
      customerName: vendorName,
      email: (vendor && vendor.email) || po.vendor_email || '',
      billingAddress: vendorAddress,
      shippingAddress: po.ship_to || '',
    },
    lines,
    subtotal,
    vatPercent,
    vatAmount: taxTotal,
    grandTotal: total,
    message: po.memo || '',
    statementMemo: '',
    company,
    currencySymbol: sym,
    templateSettings: {
      purchaseOrderLabel: 'PURCHASE ORDER',
      billToLabel: 'VENDOR',
      shipToLabel: 'SHIP TO',
      purchaseOrderNoLabel: 'PO #',
      dateLabel: 'PO DATE',
      expectedDateLabel: 'EXPECTED DATE',
      termsLabel: 'TERMS',
      ...templateSettings,
    },
  };
}

/** The email-attachment form of the PO PDF: { base64, filename, ... }. */
export function buildPurchaseOrderPdfData(po = {}, opts = {}) {
  const doc = generateDocumentPDF(buildPurchaseOrderOpts(po, opts));
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1];
  const safe = String(po.po_number || po.id || 'PO').replace(/[^A-Za-z0-9._-]/g, '_');
  return {
    base64,
    filename: `Purchase_Order_${safe}.pdf`,
    number: po.po_number,
    contentType: 'application/pdf',
    size: Math.floor((base64.length * 3) / 4),
  };
}
