import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Space, Alert, Select } from 'antd';
import { MailOutlined, SendOutlined, DesktopOutlined, CloudOutlined } from '@ant-design/icons';
import { generateDocumentPDF } from './generateDocumentPDF';
import { getCurrencySymbol } from '../../../utils/currency';

const { TextArea } = Input;
const { Option } = Select;

const SendEmailModal = ({ visible, onClose, recipientEmail, documentType, documentNumber, amount, customerName, companyName, invoiceId }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [sendMethod, setSendMethod] = useState('builtin');
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      loadDefaults();
    }
  }, [visible]);

  const loadDefaults = async () => {
    try {
      const cfg = await window.electronAPI.emailSettingsGet?.();
      if (!cfg) { setConfigured(false); return; }
      const hasBuiltin = cfg.host && cfg.user;
      setConfigured(hasBuiltin || true);
      const method = cfg.email_send_method || 'prompt';
      setShowMethodPicker(method === 'prompt');
      setSendMethod(method === 'prompt' ? 'builtin' : method);
      const subj = (cfg.default_subject || (documentType === 'Quote' ? 'Quote from {company}' : 'Invoice from {company}'))
        .replace('{company}', companyName || '')
        .replace('{number}', documentNumber || '')
        .replace('{amount}', amount || '')
        .replace('{customer}', customerName || '');
      const body = (cfg.default_body || '')
        .replace('{company}', companyName || '')
        .replace('{number}', documentNumber || '')
        .replace('{amount}', amount || '')
        .replace('{customer}', customerName || '');
      form.setFieldsValue({
        to: recipientEmail || '',
        subject: subj,
        body: body,
      });
    } catch { setConfigured(false); }
  };

  const generatePdfData = async () => {
    if (!invoiceId) return null;
    const [inv, tmpl, comp] = await Promise.all([
      window.electronAPI.getSingleInvoice(invoiceId),
      window.electronAPI.getInvoiceTemplate?.(),
      window.electronAPI.getCompany?.(),
    ]);
    if (!inv || !inv.lines) return null;
    const subtotal = inv.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const vatPct = Number(inv.vat || 0);
    const vatAmt = subtotal * (vatPct / 100);
    const grandTotal = subtotal + vatAmt;
    const opts = {
      docType: documentType === 'Quote' ? 'Quote' : 'Invoice',
      header: {
        number: inv.number || '', status: inv.status || '', date: inv.start_date || '',
        dueDate: inv.last_date || '', terms: inv.terms || '',
        customerName: `${inv.first_name || ''} ${inv.last_name || ''}`.trim(),
        email: inv.customer_email || '', billingAddress: inv.billing_address || '',
      },
      lines: (inv.lines || []).map(l => ({ description: l.description || '', quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, amount: Number(l.amount) || 0 })),
      subtotal, vatPercent: vatPct, vatAmount: vatAmt, grandTotal,
      message: inv.message || '', statementMemo: inv.statement_message || '',
      company: { name: comp?.company_name || comp?.name || '', email: comp?.email || '', phone: comp?.phone || '', address: comp?.address || '', logo: comp?.logo || null },
      currencySymbol: getCurrencySymbol(), templateSettings: tmpl || {},
    };
    const doc = generateDocumentPDF(opts);
    const dataUri = doc.output('datauristring');
    return { base64: dataUri.split(',')[1], filename: `${documentType || 'Document'}_${inv.number || invoiceId}.pdf`, number: inv.number };
  };

  const sendBuiltin = async (vals, pdfData) => {
    const attachments = [];
    if (pdfData) attachments.push({ filename: pdfData.filename, content: pdfData.base64 });
    const res = await window.electronAPI.emailSend({
      to: vals.to, cc: vals.cc || undefined, subject: vals.subject, body: vals.body,
      attachments: attachments.length > 0 ? attachments : undefined,
      document_type: documentType || 'Invoice', document_id: invoiceId || undefined,
    });
    if (res?.success) {
      await window.electronAPI.emailMarkSent({ document_type: documentType || 'Invoice', document_id: invoiceId, method: 'Built-in', status: 'Sent' });
      message.success(`Email sent to ${vals.to}`);
      onClose();
    } else {
      message.error(res?.error || 'Failed to send email');
    }
  };

  const sendExternal = async (vals, pdfData) => {
    if (!pdfData) { message.warning('Save the invoice first before emailing'); return; }
    const res = await window.electronAPI.emailSendExternal({
      to: vals.to, subject: vals.subject, body: vals.body,
      pdfFilename: pdfData.filename, pdfBase64: pdfData.base64,
      document_type: documentType || 'Invoice', document_id: invoiceId,
    });
    if (res?.success) {
      message.success('Default email program opened');
      onClose();
    } else {
      message.error(res?.error || 'Failed to open email program');
    }
  };

  const handleSend = async () => {
    try {
      const vals = await form.validateFields();
      setSending(true);
      const pdfData = await generatePdfData();
      if (sendMethod === 'external') {
        await sendExternal(vals, pdfData);
      } else {
        await sendBuiltin(vals, pdfData);
      }
    } catch (e) {
      if (!e?.errorFields) message.error('Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={<span><MailOutlined style={{ marginRight: 8 }} />Email {documentType || 'Invoice'}</span>}
      visible={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={540}
    >
      <Form form={form} layout="vertical" preserve={false}>
        {showMethodPicker && (
          <Alert type="info" showIcon icon={<MailOutlined />} message={
            <div>
              <div style={{ marginBottom: 8 }}>Choose how to send this email:</div>
              <Space>
                <Button size="small" icon={<CloudOutlined />} onClick={() => { setSendMethod('builtin'); setShowMethodPicker(false); }}>Built-in Email</Button>
                <Button size="small" icon={<DesktopOutlined />} onClick={() => { setSendMethod('external'); setShowMethodPicker(false); }}>Default Email Program</Button>
              </Space>
            </div>
          } style={{ marginBottom: 16 }} />)}
        <Form.Item name="to" label="To" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
          <Input placeholder="customer@example.com" />
        </Form.Item>
        <Form.Item name="cc" label="CC">
          <Input placeholder="Optional CC" />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Subject required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="body" label="Message" rules={[{ required: true, message: 'Message required' }]}>
          <TextArea rows={6} />
        </Form.Item>
        {invoiceId && <Alert type="info" showIcon message={`${documentType || 'Document'} PDF will be attached`} style={{ marginBottom: 16 }} />}
        {!showMethodPicker && (
          <Space>
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending}>
              Send via {sendMethod === 'external' ? 'Default Email Program' : 'Built-in Email'}
            </Button>
            <Button onClick={onClose}>Cancel</Button>
            <span style={{ fontSize: 11, color: '#888' }}>Change in Settings → Email</span>
          </Space>
        )}
      </Form>
    </Modal>
  );
};

export default SendEmailModal;
