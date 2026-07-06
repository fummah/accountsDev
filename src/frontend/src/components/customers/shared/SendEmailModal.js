import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Space, Alert } from 'antd';
import { MailOutlined, SendOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const SendEmailModal = ({ visible, onClose, recipientEmail, documentType, documentNumber, amount, customerName, companyName }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (visible) {
      loadDefaults();
    }
  }, [visible]);

  const loadDefaults = async () => {
    try {
      const cfg = await window.electronAPI.emailSettingsGet?.();
      if (!cfg || !cfg.host || !cfg.user) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      const type = (documentType || 'Invoice').charAt(0).toUpperCase() + (documentType || 'invoice').slice(1);
      const subj = (cfg.default_subject || 'Invoice from {company}')
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
    } catch {
      setConfigured(false);
    }
  };

  const handleSend = async () => {
    try {
      const vals = await form.validateFields();
      setSending(true);
      const res = await window.electronAPI.emailSend({
        to: vals.to,
        cc: vals.cc || undefined,
        subject: vals.subject,
        body: vals.body,
      });
      if (res?.success) {
        message.success(`Email sent to ${vals.to}`);
        onClose();
      } else {
        message.error(res?.error || 'Failed to send email');
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
      width={520}
    >
      {!configured ? (
        <Alert
          type="warning"
          showIcon
          message="Email Not Configured"
          description="Please configure SMTP settings first under Settings → Email."
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Form form={form} layout="vertical" preserve={false}>
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
          <Space>
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending}>
              Send Email
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </Form>
      )}
    </Modal>
  );
};

export default SendEmailModal;
