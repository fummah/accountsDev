import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, Button, message, Space, Alert, Radio, Typography } from 'antd';
import { MailOutlined, SendOutlined, DesktopOutlined, CloudOutlined, PaperClipOutlined, SettingOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { generateDocumentPDF } from './generateDocumentPDF';
import { getCurrencySymbol } from '../../../utils/currency';
import { buildDocumentEmail, isInvoiceFullyPaid, textToSafeHtml } from './documentEmail';

const { TextArea } = Input;
const { Text } = Typography;

const fmtDate = (v) => (v ? moment(v).format('MM/DD/YYYY') : '');
const fullName = (doc) => [doc?.first_name, doc?.last_name].filter(Boolean).join(' ').trim();
const fmtBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * SendEmailModal — the ONE compose dialog for Quotes and Invoices.
 *
 * The two delivery methods are independent and the user's choice is respected:
 *
 *   • Default Email Program — opens a draft in the user's desktop mail client.
 *     AccuLedger never presses Send for them. If the client cannot carry the
 *     attachment, the user is ASKED how to proceed; AccuLedger does NOT silently
 *     switch to SMTP.
 *   • Built-in Email (SMTP) — AccuLedger sends the message (and the PDF) itself.
 *     It never opens Outlook.
 */
const SendEmailModal = ({ visible, onClose, recipientEmail, documentType, documentNumber, amount, customerName, companyName, documentId }) => {
  const [form] = Form.useForm();
  const history = useHistory();
  const [sending, setSending] = useState(false);
  const [sendMethod, setSendMethod] = useState('builtin');
  const [previewBody, setPreviewBody] = useState('');
  const [mailClient, setMailClient] = useState(null);
  // The generated Quote/Invoice PDF, built from the just-saved document so it is
  // visible before Send and can never be a stale file.
  const [pdfAttachment, setPdfAttachment] = useState(null);
  // A single, friendly error (never a raw SMTP trace). Shown once, in one place.
  const [lastError, setLastError] = useState(null);
  // The compact "this app cannot attach" choice — a small modal, not a banner.
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const pendingRef = useRef(null);
  const templateRef = useRef(null);

  useEffect(() => {
    if (visible) { setLastError(null); setFallbackOpen(false); loadDefaults(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, documentId]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    window.electronAPI.emailMailClientInfo?.()
      .then((info) => { if (alive) setMailClient(info); })
      .catch(() => { if (alive) setMailClient(null); });
    return () => { alive = false; };
  }, [visible]);

  const loadDefaults = async () => {
    try {
      setPdfAttachment(null);
      const isQuote = documentType === 'Quote';
      const [cfg, comp, doc] = await Promise.all([
        window.electronAPI.emailSettingsGet?.().catch(() => null),
        window.electronAPI.getCompany?.().catch(() => null),
        documentId
          ? (isQuote
              ? window.electronAPI.getSingleQuote?.(documentId).catch(() => null)
              : window.electronAPI.getSingleInvoice?.(documentId).catch(() => null))
          : Promise.resolve(null),
      ]);

      // The saved default method. "prompt" historically meant "ask each time";
      // the dialog now always shows the method selector, so prompt simply starts
      // on the built-in sender.
      const method = cfg?.email_send_method;
      setSendMethod(method === 'external' ? 'external' : 'builtin');

      const sym = getCurrencySymbol();
      const subtotal = (doc?.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
      const vatPct = Number(doc?.vat || 0);
      const grandTotal = subtotal * (1 + vatPct / 100);
      const paid = isQuote ? 0 : Number(doc?.totalPaid || 0);
      const balance = isQuote ? 0
        : (doc && doc.balance != null ? Number(doc.balance) : Math.max(0, grandTotal - paid));
      const isPaid = !isQuote && isInvoiceFullyPaid({ status: doc?.status, balance });

      const context = {
        companyName: comp?.company_name || comp?.name || companyName || '',
        companyPhone: comp?.phone || comp?.phone_number || '',
        companyEmail: comp?.email || '',
        customerName: customerName || fullName(doc),
        documentNumber: documentNumber || doc?.number || '',
        documentType: documentType || 'Invoice',
        total: `${sym} ${grandTotal.toFixed(2)}`,
        balanceDue: `${sym} ${Math.max(0, balance).toFixed(2)}`,
        dueDate: fmtDate(doc?.last_date),
        paidDate: fmtDate(doc?.paidDate),
      };

      const tpl = buildDocumentEmail({
        documentType: documentType || 'Invoice',
        isPaid,
        config: cfg || {},
        context,
      });
      templateRef.current = { ...tpl, context, isPaid };

      const to = recipientEmail || doc?.customer_email || '';
      form.setFieldsValue({ to, subject: tpl.subject, body: tpl.body });
      setPreviewBody(tpl.body);

      try {
        const pdf = await generatePdfData();
        setPdfAttachment(pdf);
      } catch (pdfErr) {
        console.error('Could not generate the document PDF:', pdfErr);
        setPdfAttachment(null);
      }
    } catch (e) {
      console.error('Failed to load email defaults:', e);
    }
  };

  const generatePdfData = async () => {
    if (!documentId) return null;
    const isQuote = documentType === 'Quote';
    const [doc, tmpl, comp] = await Promise.all([
      isQuote ? window.electronAPI.getSingleQuote(documentId) : window.electronAPI.getSingleInvoice(documentId),
      isQuote ? window.electronAPI.getQuoteTemplate?.() : window.electronAPI.getInvoiceTemplate?.(),
      window.electronAPI.getCompany?.(),
    ]);
    const inv = doc;
    if (!inv || !inv.lines) return null;
    const subtotal = inv.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const vatPct = Number(inv.vat || 0);
    const vatAmt = subtotal * (vatPct / 100);
    const grandTotal = subtotal + vatAmt;
    const paidToDate = isQuote ? 0 : (Number(inv.totalPaid) || 0);
    const opts = {
      docType: isQuote ? 'Quote' : 'Invoice',
      header: {
        number: inv.number || '', status: inv.status || '', date: inv.start_date || '',
        dueDate: inv.last_date || '', terms: inv.terms || '',
        customerName: `${inv.first_name || ''} ${inv.last_name || ''}`.trim(),
        email: inv.customer_email || '', billingAddress: inv.billing_address || '',
        paidDate: inv.paidDate || '',
      },
      lines: (inv.lines || []).map(l => ({ description: l.description || '', quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, amount: Number(l.amount) || 0 })),
      subtotal, vatPercent: vatPct, vatAmount: vatAmt, grandTotal,
      paidToDate,
      message: inv.message || '', statementMemo: inv.statement_message || '',
      company: { name: comp?.company_name || comp?.name || '', email: comp?.email || '', phone: comp?.phone || '', address: comp?.address || '', address1: comp?.address1 || '', address2: comp?.address2 || '', city: comp?.city || '', state: comp?.state || '', postal_code: comp?.postal_code || comp?.zip || '', country: comp?.country || '', logo: comp?.logo || null },
      currencySymbol: getCurrencySymbol(), templateSettings: tmpl || {},
    };
    const doc_pdf = generateDocumentPDF(opts);
    const dataUri = doc_pdf.output('datauristring');
    const base64 = dataUri.split(',')[1];
    return {
      base64,
      filename: `${isQuote ? 'Quote' : 'Invoice'}_${inv.number || documentId}.pdf`,
      number: inv.number,
      contentType: 'application/pdf',
      size: Math.floor(base64.length * 3 / 4),
    };
  };

  const docLabel = documentType || 'Document';

  const externalClientLabel = mailClient?.adapter?.kind === 'outlook' ? 'Microsoft Outlook'
    : mailClient?.adapter?.kind === 'thunderbird' ? 'Mozilla Thunderbird'
      : (mailClient?.defaultClientName || mailClient?.progId || 'your email program');
  // Capability, not account state: a supported client (Outlook / Thunderbird)
  // composes with the PDF attached. Only a generic mailto handler falls back.
  const externalCanAttach = !!(mailClient && mailClient.canAttach);

  const showError = (res) => {
    setLastError({
      error: (res && res.error) || 'The email could not be sent. Please try again.',
      needsSettings: !!(res && res.needsSettings),
    });
  };

  const openEmailSettings = () => {
    onClose();
    history.push('/main/settings/email');
  };

  // Re-check the desktop client on demand, so a slow probe cannot push the user
  // into the fallback choice when the client can in fact attach.
  const resolveClient = async () => {
    if (mailClient) return mailClient;
    try {
      const info = await window.electronAPI.emailMailClientInfo?.();
      setMailClient(info);
      return info;
    } catch { return null; }
  };

  // ── Built-in SMTP ─────────────────────────────────────────────────────
  const sendBuiltin = async (vals, pdfData) => {
    if (!pdfData) {
      showError({ error: `The ${docLabel} PDF could not be prepared. The email was not sent.` });
      return false;
    }
    const res = await window.electronAPI.emailSend({
      to: vals.to, cc: vals.cc || undefined, subject: vals.subject, body: vals.body,
      html: textToSafeHtml(vals.body),
      attachments: [{ filename: pdfData.filename, content: pdfData.base64, contentType: pdfData.contentType || 'application/pdf' }],
      document_type: documentType || 'Invoice', document_id: documentId || undefined,
    });
    if (res?.success) {
      await window.electronAPI.emailMarkSent({ document_type: documentType || 'Invoice', document_id: documentId, method: 'Built-in', status: 'Sent' });
      message.success('Email sent successfully.');
      onClose();
      return true;
    }
    showError(res);
    return false;
  };

  // ── Default Email Program ─────────────────────────────────────────────
  // `withAttachment` is only true when the client can actually carry the PDF.
  // When false, the user explicitly chose to open the draft without it.
  const sendExternal = async (vals, pdfData, { withAttachment }) => {
    const res = await window.electronAPI.emailSendExternal({
      to: vals.to, cc: vals.cc || undefined, subject: vals.subject, body: vals.body,
      pdfFilename: pdfData ? pdfData.filename : undefined,
      pdfBase64: pdfData ? pdfData.base64 : undefined,
      document_type: documentType || 'Invoice', document_id: documentId,
      requireAttachment: !!withAttachment,
    });
    if (res?.success) {
      message.success(withAttachment && res.attached
        ? `Email draft opened in ${res.client || externalClientLabel} with the PDF attached.`
        : `Email draft opened in ${res.client || externalClientLabel}.`);
      onClose();
      return true;
    }
    showError(res);
    return false;
  };

  const handleSend = async () => {
    if (sending) return;
    let vals;
    try {
      vals = await form.validateFields();
    } catch (e) {
      return; // validation errors are shown inline
    }
    setSending(true);
    setLastError(null);
    try {
      let pdf = pdfAttachment;
      if (!pdf) pdf = await generatePdfData();
      if (!pdf) {
        showError({ error: `The ${docLabel} PDF could not be prepared. The email was not sent.` });
        return;
      }
      setPdfAttachment(pdf);

      // Strict dispatch: the selected method is honoured. No cross-over.
      if (sendMethod === 'builtin') {
        await sendBuiltin(vals, pdf);
        return;
      }

      const info = await resolveClient();
      if (info && info.canAttach) {
        await sendExternal(vals, pdf, { withAttachment: true });
        return;
      }
      // The chosen client cannot attach automatically — ask the user, never
      // silently switch to SMTP.
      pendingRef.current = { vals, pdf };
      setFallbackOpen(true);
    } catch (e) {
      console.error('Email send failed:', e);
      showError({ error: 'The email could not be sent. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const chooseOpenWithoutAttachment = async () => {
    const p = pendingRef.current;
    setFallbackOpen(false);
    if (!p) return;
    setSending(true);
    try { await sendExternal(p.vals, p.pdf, { withAttachment: false }); }
    finally { setSending(false); }
  };

  const chooseUseAccuLedger = async () => {
    const p = pendingRef.current;
    setFallbackOpen(false);
    if (!p) return;
    setSendMethod('builtin');
    setSending(true);
    try { await sendBuiltin(p.vals, p.pdf); }
    finally { setSending(false); }
  };

  const kind = templateRef.current?.isPaid ? 'paid invoice' : (documentType === 'Quote' ? 'quote' : 'invoice');

  return (
    <Modal
      title={<span><MailOutlined style={{ marginRight: 8 }} />Email {documentType || 'Invoice'}</span>}
      visible={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" preserve={false}>
        {/* Method selector — always visible, defaults to the saved setting. */}
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Send using</Text>
          <Radio.Group
            buttonStyle="solid"
            value={sendMethod}
            onChange={e => setSendMethod(e.target.value)}
            style={{ width: '100%', display: 'flex' }}
          >
            <Radio.Button value="builtin" style={{ flex: 1, textAlign: 'center', height: 38, lineHeight: '36px', fontSize: 13 }}>
              <CloudOutlined /> Built-in Email (SMTP)
            </Radio.Button>
            <Radio.Button value="external" style={{ flex: 1, textAlign: 'center', height: 38, lineHeight: '36px', fontSize: 13 }}>
              <DesktopOutlined /> Default Email Program
            </Radio.Button>
          </Radio.Group>
          {sendMethod === 'external' ? (
            <div style={{ marginTop: 6, fontSize: 11, color: '#8c8c8c' }}>
              {!mailClient
                ? "Checking this machine's email program…"
                : externalCanAttach
                  ? `${externalClientLabel} will open with the PDF attached — you press Send there.`
                  : `${externalClientLabel} will open with the message — you will be asked how to handle the PDF.`}
            </div>
          ) : null}
        </div>

        <Form.Item name="to" label="To" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
          <Input placeholder="customer@example.com" />
        </Form.Item>
        <Form.Item name="cc" label="CC">
          <Input placeholder="Optional CC" />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Subject required' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="body"
          label="Message"
          rules={[{ required: true, message: 'Message required' }]}
          extra={<Text type="secondary" style={{ fontSize: 11 }}>Editing the {kind} message. These are defaults — change them if you wish.</Text>}
        >
          <TextArea rows={8} onChange={e => setPreviewBody(e.target.value)} />
        </Form.Item>
        {previewBody ? (
          <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#fafafa', maxHeight: 160, overflow: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Preview</Text>
            <div
              style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: textToSafeHtml(previewBody) }}
            />
          </div>
        ) : null}
        {documentId ? (
          <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: pdfAttachment ? '#f6ffed' : '#fffbe6' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Attachments</Text>
            {pdfAttachment ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <PaperClipOutlined />
                <Text strong>{pdfAttachment.filename}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>PDF • {fmtBytes(pdfAttachment.size)}</Text>
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <Text type="warning">Preparing the {documentType || 'document'} PDF attachment…</Text>
              </div>
            )}
          </div>
        ) : null}

        {/* One friendly error, one place — never a raw SMTP trace. */}
        {lastError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={lastError.error}
            action={lastError.needsSettings ? (
              <Button size="small" icon={<SettingOutlined />} onClick={openEmailSettings}>Open Email Settings</Button>
            ) : null}
          />
        ) : null}

        <Space>
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending}>
            {sendMethod === 'external' ? 'Open in Email Program' : 'Send Email'}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      </Form>

      {/* The compact choice when the default program cannot attach automatically.
          SMTP is used ONLY if the user explicitly picks "Use AccuLedger Email". */}
      <Modal
        title="This email app cannot attach files automatically"
        visible={fallbackOpen}
        onCancel={() => setFallbackOpen(false)}
        footer={[
          <Button key="open" onClick={chooseOpenWithoutAttachment} loading={sending}>
            Open Without Attachment
          </Button>,
          <Button key="accu" type="primary" onClick={chooseUseAccuLedger} loading={sending}>
            Use AccuLedger Email
          </Button>,
        ]}
        width={460}
        zIndex={1200}
      >
        <Text>
          {externalClientLabel} can open a message with the recipient, subject and message filled in,
          but it cannot attach the {docLabel} PDF automatically.
        </Text>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Open Without Attachment — opens the draft in {externalClientLabel}; attach the PDF yourself before sending.
            <br />
            Use AccuLedger Email — sends the {docLabel} with the PDF attached through your built-in email settings.
          </Text>
        </div>
      </Modal>
    </Modal>
  );
};

export default SendEmailModal;
