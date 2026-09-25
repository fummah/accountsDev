import React from 'react';
import { Form, Input, Select, Row, Col } from 'antd';
import {
  UserOutlined, PhoneOutlined, EnvironmentOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import COUNTRIES from '../../../utils/countries';
import { phoneInputHandler } from '../../../utils/phone';
import { firstOrCompanyValidator, getContactRules } from './customerValidation';
import FormSection, { FORM_ITEM_STYLE } from '../../shared/FormSection';
import ContactIdentityNote from '../../shared/ContactIdentityNote';
import TaxSettingsSection from '../../shared/TaxSettingsSection';

// Re-exported for backwards compatibility — the rule now lives in
// customerValidation.js so the lead form can compose the same definition.
export { firstOrCompanyValidator };

/**
 * Shared customer / contact fields.
 *
 * This is the single definition of the customer contact block. It is used by
 * every place that captures customer details, so the field list, labels,
 * placeholders, validation and phone formatting can never drift apart:
 *
 *   • CustomerCenter.js  — "Add Customer" modal
 *   • CustomerList.js    — "Add Customer" modal
 *   • CustomerDetails.js — "Edit Customer" modal
 *   • CreateInvoice.js   — "Add New Customer" modal
 *   • CreateQuote.js     — "Add New Customer" modal
 *   • Leads.js           — "New Lead" (layout="lead": Customer/Contact + Address)
 *
 * Field names match the `customers` table columns exactly (first_name,
 * last_name, display_name, company_name, email, phone_number, mobile_number,
 * address1, address2, city, state, postal_code, country, notes) so the same
 * component can drive a form whose payload is inserted straight into that
 * table. The Lead model mirrors the same column names for the same reason.
 *
 * LAYOUT
 *   sections !== false (default) → grouped section cards, in this order:
 *        Customer Information → Contact Information → Billing Address
 *        → Tax Settings (when `vatRates` is supplied) → Notes
 *   layout === 'lead'            → the Lead form's grouping: one
 *        "Customer / Contact Information" card (identity + contact, plus any
 *        `extraFields` such as Website) and one "Address" card. Uses the same
 *        shared FormSection and the same field definitions.
 *   sections === false           → the original flat 3-column grid (legacy).
 *
 * NOTHING about the data changed: same field names, same labels, same
 * placeholders, same validation rules, same phone formatting, same payload.
 *
 * VALIDATION NOTE
 *   First Name carries the shared "First Name OR Company Name" rule (see
 *   ../../../utils/contactIdentity.js). Neither field is individually required,
 *   so there is deliberately no `*` on either one; instead a short note states
 *   the pair requirement. `showIdentityNote={false}` suppresses it for callers
 *   that render their own.
 */

export const CONTACT_FIELD_NAMES = [
  'first_name', 'last_name', 'display_name', 'company_name',
  'email', 'phone_number', 'mobile_number',
  'address1', 'address2', 'city', 'state', 'postal_code', 'country',
  'notes',
];

const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 16 };

const CustomerContactFields = ({
  form,
  showNotes = true,
  notesRows = 2,
  notesAsInput = false,
  countryPlaceholder = 'Select country',
  firstPlaceholder,
  address1Placeholder,
  address2Placeholder,
  displayNamePlaceholder = 'Auto-generated if blank',
  gridColumns,
  onEmailChange,
  sections = true,
  layout,
  extraFields,
  vatRates,
  showIdentityNote = true,
}) => {
  // One definition per field, laid out differently per mode — so the two
  // layouts can never drift apart.
  const compact = sections !== false;
  const item = (name, label, input, extra = {}) => (
    <Form.Item name={name} label={label} style={compact ? FORM_ITEM_STYLE : undefined} {...extra}>
      {input}
    </Form.Item>
  );

  const fields = {
    first_name: item('first_name', 'First Name', <Input placeholder={firstPlaceholder} />,
      { rules: getContactRules('first_name', form) }),
    last_name: item('last_name', 'Last Name', <Input />),
    display_name: item('display_name', 'Display Name', <Input placeholder={displayNamePlaceholder} />),
    company_name: item('company_name', 'Company', <Input />),
    email: item('email', 'Email', (
      <Input type="email" placeholder="email@example.com"
        onChange={e => { if (onEmailChange) onEmailChange(e.target.value); }} />
    )),
    phone_number: item('phone_number', 'Phone', (
      <Input placeholder="(XXX) XXX-XXXX"
        onChange={e => form.setFieldsValue({ phone_number: phoneInputHandler(e.target.value) })} />
    )),
    mobile_number: item('mobile_number', 'Mobile', (
      <Input placeholder="(XXX) XXX-XXXX"
        onChange={e => form.setFieldsValue({ mobile_number: phoneInputHandler(e.target.value) })} />
    )),
    address1: item('address1', 'Street Address', <Input placeholder={address1Placeholder} />),
    address2: item('address2', 'Address Line 2', <Input placeholder={address2Placeholder} />),
    city: item('city', 'City', <Input />),
    state: item('state', 'State', <Input />),
    postal_code: item('postal_code', 'ZIP', <Input />),
    country: item('country', 'Country', (
      <Select showSearch placeholder={countryPlaceholder} allowClear optionFilterProp="children">
        {COUNTRIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
      </Select>
    )),
    notes: item('notes', 'Notes', notesAsInput ? <Input /> : <Input.TextArea rows={notesRows} />),
  };

  // ── Lead form layout ──────────────────────────────────────────────────────
  // Two boxes that match the shared section design used by Invoice/Quote/
  // Customer: identity + contact details (with any caller-supplied extra field,
  // e.g. Website) and the address. Same field definitions, same validation —
  // only the grouping differs.
  if (layout === 'lead') {
    return (
      <>
        <FormSection title="Customer / Contact Information" icon={<UserOutlined />}>
          <Row gutter={12}>
            <Col xs={24} md={12} lg={8}>{fields.first_name}</Col>
            <Col xs={24} md={12} lg={8}>{fields.last_name}</Col>
            <Col xs={24} md={12} lg={8}>{fields.display_name}</Col>
            <Col span={24}>{fields.company_name}</Col>
            <Col xs={24} sm={12} lg={8}>{fields.email}</Col>
            <Col xs={24} sm={12} lg={8}>{fields.phone_number}</Col>
            <Col xs={24} sm={12} lg={8}>{fields.mobile_number}</Col>
            {extraFields ? <Col span={24}>{extraFields}</Col> : null}
          </Row>
          {showIdentityNote ? <ContactIdentityNote /> : null}
        </FormSection>

        <FormSection title="Address" icon={<EnvironmentOutlined />}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>{fields.address1}</Col>
            <Col xs={24} sm={12}>{fields.address2}</Col>
            <Col xs={24} sm={8}>{fields.city}</Col>
            <Col xs={24} sm={8}>{fields.state}</Col>
            <Col xs={24} sm={8}>{fields.postal_code}</Col>
            <Col span={24}>{fields.country}</Col>
          </Row>
        </FormSection>

        {showNotes ? (
          <FormSection title="Notes" icon={<FileTextOutlined />}>
            <Row gutter={12}>
              <Col span={24}>{fields.notes}</Col>
            </Row>
          </FormSection>
        ) : null}
      </>
    );
  }

  // ── Legacy flat layout ────────────────────────────────────────────────────
  // The note cannot live inside the grid: a full-width item placed mid-grid
  // leaves a hole where the row it spans was skipped. It sits below instead.
  if (sections === false) {
    return (
      <>
        <div style={gridColumns ? { ...gridStyle, gridTemplateColumns: gridColumns } : gridStyle}>
          {fields.first_name}
          {fields.last_name}
          {fields.display_name}
          {fields.company_name}
          {fields.email}
          {fields.phone_number}
          {fields.mobile_number}
          {fields.address1}
          {fields.address2}
          {fields.city}
          {fields.state}
          {fields.postal_code}
          {fields.country}
          {showNotes && fields.notes}
        </div>
        {showIdentityNote ? <ContactIdentityNote style={{ marginTop: 4 }} /> : null}
      </>
    );
  }

  // ── Sectioned layout (Add / Edit Customer) ────────────────────────────────
  return (
    <>
      <FormSection title="Customer Information" icon={<UserOutlined />}>
        <Row gutter={12}>
          <Col xs={24} md={12} lg={8}>{fields.first_name}</Col>
          <Col xs={24} md={12} lg={8}>{fields.last_name}</Col>
          <Col xs={24} md={12} lg={8}>{fields.display_name}</Col>
          <Col span={24}>{fields.company_name}</Col>
        </Row>
        {/* Neither field is individually required — the requirement is the pair,
            so it is stated as a note rather than a `*` on First Name. */}
        {showIdentityNote ? <ContactIdentityNote /> : null}
      </FormSection>

      <FormSection title="Contact Information" icon={<PhoneOutlined />}>
        <Row gutter={12}>
          <Col xs={24} sm={12}>{fields.email}</Col>
          <Col xs={24} sm={12}>{fields.phone_number}</Col>
          <Col xs={24} sm={12}>{fields.mobile_number}</Col>
        </Row>
      </FormSection>

      <FormSection title="Billing Address" icon={<EnvironmentOutlined />}>
        <Row gutter={12}>
          <Col xs={24} sm={12}>{fields.address1}</Col>
          <Col xs={24} sm={12}>{fields.address2}</Col>
          <Col xs={24} sm={8}>{fields.city}</Col>
          <Col xs={24} sm={8}>{fields.state}</Col>
          <Col xs={24} sm={8}>{fields.postal_code}</Col>
          <Col span={24}>{fields.country}</Col>
        </Row>
      </FormSection>

      {vatRates ? <TaxSettingsSection vatRates={vatRates} form={form} /> : null}

      {showNotes ? (
        <FormSection title="Notes" icon={<FileTextOutlined />}>
          <Row gutter={12}>
            <Col span={24}>{fields.notes}</Col>
          </Row>
        </FormSection>
      ) : null}
    </>
  );
};

/**
 * Backwards-compatible re-export. The Tax Settings section is now the shared
 * `TaxSettingsSection` component (in components/shared/), which uses the
 * shared `TaxRateSelect` dropdown, stores the VAT rate's `id` (not the
 * display text), and disables/clears the rate when Tax Status = Non-Taxable.
 *
 * Customer and Vendor forms both import `TaxSettingsSection` directly now.
 * This re-export keeps any existing `import { CustomerTaxFields }` working.
 */
export { default as CustomerTaxFields } from '../../shared/TaxSettingsSection';

export default CustomerContactFields;
