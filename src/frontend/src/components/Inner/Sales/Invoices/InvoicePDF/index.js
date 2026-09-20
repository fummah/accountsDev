import React from "react";
import { DownloadOutlined } from '@ant-design/icons';
import { handleDocumentPDF } from 'components/customers/shared/generateDocumentPDF';
import { useCurrency } from '../../../../../utils/currency';

const InvoicePDF = ({ invoice, type }) => {
  const { symbol: cSym } = useCurrency();

  const doDownload = async () => {
    const inv = invoice || {};
    const lines = (inv.lines || []).map(l => ({
      description: l.description || '',
      quantity: Number(l.quantity || 0),
      rate: Number(l.rate || 0),
      amount: Number(l.amount || 0),
    }));
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const vatPct = Number(inv.vat || 0);
    const vatAmt = subtotal * (vatPct / 100);
    const grandTotal = subtotal + vatAmt;
    const docType = (type || '').toLowerCase().includes('quote') ? 'Quote' : 'Invoice';
    const customerName = inv.customer_name || `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || (docType === 'Quote' ? inv.customer : inv.customer) || '';

    let company = {};
    try { company = await window.electronAPI.getCompany?.() || {}; } catch { company = {}; }

    handleDocumentPDF('download', {
      docType,
      header: {
        number: inv.number || '',
        status: inv.status || '',
        date: inv.start_date || '',
        dueDate: inv.last_date || '',
        terms: inv.terms || '',
        customerName,
        email: inv.customer_email || '',
        billingAddress: inv.billing_address || '',
      },
      lines,
      subtotal,
      vatPercent: vatPct,
      vatAmount: vatAmt,
      grandTotal,
      paidToDate: docType === 'Quote' ? 0 : (Number(inv.totalPaid) || 0),
      message: inv.message || '',
      statementMemo: inv.statement_message || '',
      company,
      currencySymbol: cSym,
    });
  };

  return (
    <DownloadOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={doDownload} />
  );
};

export default InvoicePDF;