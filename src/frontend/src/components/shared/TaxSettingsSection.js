import React, { useEffect } from 'react';
import { Form, Select, Row, Col } from 'antd';
import { PercentageOutlined } from '@ant-design/icons';
import FormSection, { FORM_ITEM_STYLE } from './FormSection';
import TaxRateSelect from './TaxRateSelect';

/**
 * TaxSettingsSection — the shared "Tax Settings" form section used by every
 * contact form (Customer, Vendor, and any future contact type).
 *
 * Renders:
 *   • Tax Status   — Taxable / Non-Taxable
 *   • Default Tax Rate — dropdown of saved VAT rates (via TaxRateSelect)
 *
 * CONDITIONAL LOGIC
 *   When Tax Status = Non-Taxable, the Default Tax Rate dropdown is disabled
 *   and its value is cleared, so a non-taxable contact cannot carry a stale
 *   rate reference.
 *
 * ID-BASED STORAGE
 *   The dropdown stores `default_tax_rate_id` (the VAT rate's unique id), not
 *   the display text or the percentage. This means:
 *     - Renaming a VAT rate updates every contact's display automatically
 *     - Deleting/deactivating a rate can be handled referentially
 *     - The relationship is by reference, not by a typed number
 *
 * This component replaces the old inline `CustomerTaxFields`. Customer forms
 * re-export it as `CustomerTaxFields` for backwards compatibility.
 *
 * Props:
 *   vatRates — array of { id, vat_name, vat_percentage } from getAllVat()
 *   form     — the antd Form instance (required for useWatch + setFieldsValue)
 */
const TaxSettingsSection = ({ vatRates = [], form }) => {
  const taxable = Form.useWatch('taxable', form);
  const isTaxable = taxable !== false; // default true when undefined

  // When Tax Status switches to Non-Taxable, clear the rate so a stale
  // reference is not persisted. The dropdown is also disabled (below), so
  // the user sees the change immediately.
  useEffect(() => {
    if (isTaxable === false && form) {
      form.setFieldsValue({ default_tax_rate_id: undefined });
    }
  }, [isTaxable, form]);

  return (
    <FormSection title="Tax Settings" icon={<PercentageOutlined />}>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item name="taxable" label="Tax Status" initialValue={true} style={FORM_ITEM_STYLE}>
            <Select>
              <Select.Option value={true}>Taxable</Select.Option>
              <Select.Option value={false}>Non-Taxable</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="default_tax_rate_id" label="Default Tax Rate" style={FORM_ITEM_STYLE}>
            <TaxRateSelect vatRates={vatRates} disabled={!isTaxable} />
          </Form.Item>
        </Col>
      </Row>
    </FormSection>
  );
};

export default TaxSettingsSection;
