import React, { useState } from 'react';
import { Modal, Form, message } from 'antd';
import CustomerContactFields from '../customers/shared/CustomerContactFields';
import { MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from './FormSection';

/**
 * PartyCreateModal — the ONE "Add New Customer / Vendor" dialog, reused by any
 * transaction that lets the user create a party without leaving their workflow
 * (Make Deposits, Write Check, …). It reuses the SAME shared contact block and
 * the SAME insertCustomer / insertSupplier payload the Customers / Vendors
 * screens use — never a second, parallel party form.
 *
 * On success it resolves the newly created record via the SAME server-side
 * search used elsewhere and hands it to `onCreated(record)` so the caller can
 * auto-select it while preserving the rest of its form.
 */
const PartyCreateModal = ({ open, type = 'customer', onClose, onCreated }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isVendor = type === 'vendor';

  const close = () => { if (!saving) { form.resetFields(); onClose && onClose(); } };

  const submit = async () => {
    if (saving) return; // double-submit protection
    let vals;
    try { vals = await form.validateFields(); } catch (e) { return; } // inline validation
    setSaving(true);
    try {
      const display = vals.display_name
        || `${vals.first_name || ''} ${vals.last_name || ''}`.trim()
        || vals.company_name || '';
      const res = isVendor
        ? await window.electronAPI.insertSupplier(
            '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '',
            display, vals.company_name || '', vals.phone_number || '', vals.mobile_number || '',
            '', '', vals.website || '', vals.address1 || '', vals.address2 || '', vals.city || '', vals.state || '',
            vals.postal_code || '', vals.country || '', '', '', '', '', 0, null, 'system',
            vals.notes || '', '', vals.taxable != null ? vals.taxable : true, null, null,
          )
        : await window.electronAPI.insertCustomer(
            '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '',
            display, vals.company_name || '', vals.phone_number || '', vals.mobile_number || '',
            '', '', vals.website || '', vals.address1 || '', vals.address2 || '', vals.city || '', vals.state || '',
            vals.postal_code || '', vals.country || '', '', '', '', 'system', 0, null, 'Email', 'en',
            vals.notes || '', vals.taxable != null ? vals.taxable : true, null, null,
          );
      if (!res || res.success === false || res.error) { message.error(res?.error || 'Save failed'); return; }

      // Resolve the created record via the same server-side search (never a full load).
      const term = vals.email || vals.display_name || vals.company_name
        || `${vals.first_name || ''} ${vals.last_name || ''}`.trim();
      const found = isVendor
        ? await window.electronAPI.getSuppliersPaginated?.(1, 25, term || '').catch(() => null)
        : await window.electronAPI.getCustomersPaginated?.(1, 25, term || '', '').catch(() => null);
      const rows = Array.isArray(found?.data) ? found.data : (Array.isArray(found) ? found : []);
      const email = String(vals.email || '').toLowerCase();
      const record = rows.find(r => email && String(r.email || '').toLowerCase() === email)
        || rows.find(r => String(r.display_name || '').toLowerCase() === display.toLowerCase())
        || rows[0] || null;

      message.success(isVendor ? 'Vendor added' : 'Customer added');
      form.resetFields();
      onClose && onClose();
      onCreated && onCreated(record, { isVendor, display });
    } catch (e) {
      if (!e?.errorFields) message.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={isVendor ? 'Add New Vendor' : 'Add New Customer'}
      visible={open}
      onOk={submit}
      onCancel={close}
      confirmLoading={saving}
      okText="Add"
      destroyOnClose
      width={MODAL_WIDTH}
      bodyStyle={MODAL_BODY_SCROLL_STYLE}
    >
      <Form form={form} layout="vertical">
        <CustomerContactFields form={form} />
      </Form>
    </Modal>
  );
};

export default PartyCreateModal;
