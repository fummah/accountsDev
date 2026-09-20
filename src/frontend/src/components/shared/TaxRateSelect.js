import React from 'react';
import { Select } from 'antd';

/**
 * TaxRateSelect — the ONE tax rate dropdown used by every form that captures a
 * Default Tax Rate (Customer, Vendor, and any future contact type).
 *
 * It renders a Select populated from the application's saved VAT rates (the
 * `vat` table via the `get-vat` IPC channel). The value stored is the VAT
 * rate's unique `id`, NOT the display text or the percentage — so the form
 * relationship is by reference, and renaming a tax rate propagates
 * automatically.
 *
 * DO NOT create a parallel dropdown for Vendors or any other entity. Import
 * this component instead.
 *
 * Props:
 *   vatRates  — array of { id, vat_name, vat_percentage } from getAllVat()
 *   disabled  — disables the select (e.g. when Tax Status = Non-Taxable)
 *   ...rest   — any other antd Select props (onChange, style, etc.)
 */
const TaxRateSelect = ({ vatRates = [], disabled = false, ...rest }) => (
  <Select
    showSearch
    allowClear
    optionFilterProp="children"
    placeholder="Select tax rate"
    disabled={disabled}
    notFoundContent={vatRates.length === 0 ? 'No tax rates configured — add rates in Tax Settings' : 'No match'}
    {...rest}
  >
    {vatRates.map(v => (
      <Select.Option key={v.id} value={v.id}>
        {v.vat_name} ({v.vat_percentage}%)
      </Select.Option>
    ))}
  </Select>
);

export default TaxRateSelect;
