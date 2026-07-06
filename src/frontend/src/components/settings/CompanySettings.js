import React, { useState, useEffect } from 'react';
import {
  Card, Form, Input, Select, Button, Upload, message, Row, Col,
  InputNumber, Tabs, Spin, Divider, Typography
} from 'antd';
import {
  SaveOutlined, PictureOutlined, BuildOutlined, BankOutlined,
  GlobalOutlined, DollarOutlined, ShopOutlined, SettingOutlined
} from '@ant-design/icons';
import { refreshBaseCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'ZAR', label: 'ZAR — South African Rand (R)' },
  { value: 'NGN', label: 'NGN — Nigerian Naira (₦)' },
  { value: 'CAD', label: 'CAD — Canadian Dollar (C$)' },
  { value: 'AUD', label: 'AUD — Australian Dollar (A$)' },
  { value: 'AED', label: 'AED — UAE Dirham (AED)' },
  { value: 'INR', label: 'INR — Indian Rupee (₹)' },
  { value: 'KES', label: 'KES — Kenyan Shilling (KSh)' },
  { value: 'GHS', label: 'GHS — Ghanaian Cedi (₵)' },
  { value: 'EGP', label: 'EGP — Egyptian Pound (E£)' },
];

const CompanySettings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState(null);
  const [activeTab, setActiveTab] = useState('company');

  useEffect(() => {
    loadCompanyData();
  }, []);

  const loadCompanyData = async () => {
    setLoading(true);
    try {
      const info = await window.electronAPI?.getCompany?.();
      const settings = {};
      // Load settings values
      try {
        settings.date_format = await window.electronAPI?.settingsGet?.('date_format') || 'MM/DD/YYYY';
        settings.tax_jurisdiction = await window.electronAPI?.settingsGet?.('tax_jurisdiction') || 'US';
        settings.fiscal_year_start = await window.electronAPI?.settingsGet?.('fiscal_year_start') || 'january';
        settings.accent_color = await window.electronAPI?.settingsGet?.('accent_color') || '#1890ff';
      } catch {}

      if (info) {
        form.setFieldsValue({
          name: info.name || '',
          reg_number: info.reg_number || '',
          industry: info.industry || 'general',
          business_type: info.business_type || '',
          address: info.address || '',
          email: info.email || '',
          phone: info.phone || '',
          website: info.website || '',
          tax_id: info.tax_id || '',
          currency: info.currency || 'USD',
          fy_start: info.fy_start || settings.fiscal_year_start || 'january',
          vat_rate: info.vat_rate != null ? info.vat_rate : 0,
          tax_name: info.tax_name || 'VAT',
          terms: info.terms != null ? info.terms : 30,
          bank_name: info.bank_name || '',
          account_number: info.account_number || '',
          branch_code: info.branch_code || '',
          routing_number: info.routing_number || '',
          account_type: info.account_type || 'Checking',
          opening_balance: info.opening_balance || 0,
          date_format: settings.date_format || 'MM/DD/YYYY',
          tax_jurisdiction: settings.tax_jurisdiction || 'US',
        });
        if (info.logo && typeof info.logo === 'string' && info.logo.startsWith('data:')) {
          setLogo(info.logo);
        }
      }
    } catch (err) {
      message.error('Failed to load company data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => resolve(r.result);
    r.onerror = reject;
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      const vals = form.getFieldsValue(true);
      await window.electronAPI?.saveCompany?.({
        ...vals,
        logo,
      });
      // Sync settings to actual system preferences
      if (vals.date_format) await window.electronAPI?.settingsSet?.('date_format', vals.date_format);
      if (vals.tax_jurisdiction) await window.electronAPI?.settingsSet?.('tax_jurisdiction', vals.tax_jurisdiction);
      if (vals.fy_start) await window.electronAPI?.settingsSet?.('fiscal_year_start', vals.fy_start);
      if (vals.vat_rate != null) await window.electronAPI?.settingsSet?.('default_tax_rate', String(vals.vat_rate));
      if (vals.tax_name) await window.electronAPI?.settingsSet?.('tax_name', vals.tax_name);
      if (vals.terms != null) await window.electronAPI?.settingsSet?.('default_invoice_terms', String(vals.terms));
      if (vals.currency) {
        await window.electronAPI?.settingsSet?.('base_currency', vals.currency);
        try { await window.electronAPI?.currencySetBase?.(vals.currency); } catch {}
        await refreshBaseCurrency();
      }
      message.success('Company settings saved successfully');
    } catch (err) {
      message.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" tip="Loading company settings..." /></div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>My Company Settings</Title>
          <Text type="secondary">Manage your company profile, branding, tax, and banking details</Text>
        </div>
        <Button type="primary" icon={<SaveOutlined />} size="large" onClick={handleSave} loading={saving}>
          Save All Changes
        </Button>
      </div>

      <Form form={form} layout="vertical">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'company',
            label: <span><BuildOutlined /> Company Info</span>,
            forceRender: true,
            children: (
              <Card size="small">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="name" label="Company Name" rules={[{ required: true, message: 'Required' }]} style={{ flex: 2 }}>
                    <Input placeholder="My Business Pty Ltd" size="large" />
                  </Form.Item>
                  <Form.Item name="reg_number" label="Registration Number" style={{ flex: 1 }}>
                    <Input placeholder="Company reg #" />
                  </Form.Item>
                  <Form.Item name="tax_id" label="Tax ID / EIN" style={{ flex: 1 }}>
                    <Input placeholder="XX-XXXXXXX" />
                  </Form.Item>
                </div>
                <Form.Item name="address" label="Business Address">
                  <Input.TextArea rows={2} placeholder="123 Main Street, City, State, ZIP" />
                </Form.Item>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="phone" label="Phone" style={{ flex: 1 }}>
                    <Input placeholder="+1 (555) 123-4567" />
                  </Form.Item>
                  <Form.Item name="email" label="Email" style={{ flex: 1 }}>
                    <Input placeholder="info@yourbusiness.com" />
                  </Form.Item>
                  <Form.Item name="website" label="Website" style={{ flex: 1 }}>
                    <Input placeholder="www.yourbusiness.com" />
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="industry" label="Industry" style={{ flex: 1 }}>
                    <Select>
                      <Option value="general">General / Other</Option>
                      <Option value="retail">Retail / Wholesale</Option>
                      <Option value="professional-services">Professional Services</Option>
                      <Option value="construction">Construction / Contracting</Option>
                      <Option value="manufacturing">Manufacturing</Option>
                      <Option value="non-profit">Non-Profit</Option>
                      <Option value="hospitality">Hospitality / Restaurant</Option>
                      <Option value="healthcare">Healthcare</Option>
                      <Option value="technology">Technology / SaaS</Option>
                      <Option value="real-estate">Real Estate</Option>
                      <Option value="transport">Transport / Logistics</Option>
                      <Option value="education">Education</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="business_type" label="Business Type" style={{ flex: 1 }}>
                    <Select placeholder="Select business type" allowClear>
                      <Option value="pty">Pty Ltd</Option>
                      <Option value="llc">LLC</Option>
                      <Option value="corp">Corporation</Option>
                      <Option value="sole">Sole Proprietor</Option>
                      <Option value="partnership">Partnership</Option>
                      <Option value="ngo">Non-Profit</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="terms" label="Default Invoice Terms (Days)" style={{ flex: 1 }}>
                    <InputNumber min={0} max={365} style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              </Card>
            )
          },
          {
            key: 'branding',
            label: <span><PictureOutlined /> Branding</span>,
            forceRender: true,
            children: (
              <Card size="small">
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Company Logo</div>
                    <Upload accept="image/*" showUploadList={false}
                      beforeUpload={async (file) => {
                        try { const b64 = await getBase64(file); setLogo(b64); message.success('Logo uploaded — click Save to keep it'); }
                        catch { message.error('Upload failed'); }
                        return false;
                      }}
                    >
                      <div style={{ width: 180, height: 120, border: '2px dashed #d9d9d9', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa', overflow: 'hidden' }}>
                        {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          : <><PictureOutlined style={{ fontSize: 32, color: '#bbb', marginBottom: 4 }} /><span style={{ fontSize: 12, color: '#aaa' }}>Click to upload</span></>
                        }
                      </div>
                    </Upload>
                    {logo && <Button size="small" type="link" danger onClick={() => setLogo(null)} style={{ paddingLeft: 0, marginTop: 4 }}>Remove Logo</Button>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Preview</div>
                    <div style={{ border: '2px solid #1890ff', borderRadius: 10, padding: '16px 20px', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 16 }}>
                      {logo ? <img src={logo} alt="logo" style={{ height: 50, objectFit: 'contain' }} />
                        : <div style={{ width: 50, height: 50, borderRadius: 8, background: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BuildOutlined style={{ color: '#fff', fontSize: 22 }} />
                          </div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1890ff' }}>{form.getFieldValue('name') || 'Your Company Name'}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>Invoice / Report Header Preview</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          },
          {
            key: 'currency',
            label: <span><GlobalOutlined /> Currency & Tax</span>,
            forceRender: true,
            children: (
              <Card size="small">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="currency" label="Base Currency" style={{ flex: 1 }}>
                    <Select showSearch optionFilterProp="label" options={CURRENCIES.map(c => ({ value: c.value, label: c.label }))} />
                  </Form.Item>
                  <Form.Item name="tax_jurisdiction" label="Tax Jurisdiction" style={{ flex: 1 }}>
                    <Select showSearch>
                      <Option value="US">United States</Option>
                      <Option value="UK">United Kingdom</Option>
                      <Option value="CA">Canada</Option>
                      <Option value="AU">Australia</Option>
                      <Option value="ZA">South Africa</Option>
                      <Option value="NG">Nigeria</Option>
                      <Option value="GH">Ghana</Option>
                      <Option value="KE">Kenya</Option>
                      <Option value="AE">UAE</Option>
                      <Option value="IN">India</Option>
                      <Option value="EG">Egypt</Option>
                    </Select>
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="fy_start" label="Fiscal Year Start" style={{ flex: 1 }}>
                    <Select>
                      {['january','february','march','april','may','june','july','august','september','october','november','december'].map(m => (
                        <Option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item name="date_format" label="Date Format" style={{ flex: 1 }}>
                    <Select>
                      <Option value="MM/DD/YYYY">MM/DD/YYYY (US)</Option>
                      <Option value="DD/MM/YYYY">DD/MM/YYYY (UK / Africa / EU)</Option>
                      <Option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</Option>
                      <Option value="DD.MM.YYYY">DD.MM.YYYY (German)</Option>
                    </Select>
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="vat_rate" label="Default Tax Rate (%)" style={{ flex: 1 }}>
                    <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} formatter={v => `${v}%`} parser={v => v.replace('%', '')} />
                  </Form.Item>
                  <Form.Item name="tax_name" label="Tax Name (e.g. VAT, GST)" style={{ flex: 1 }}>
                    <Input placeholder="VAT" />
                  </Form.Item>
                  <div style={{ flex: 1 }} />
                </div>
              </Card>
            )
          },
          {
            key: 'banking',
            label: <span><BankOutlined /> Banking</span>,
            forceRender: true,
            children: (
              <Card size="small">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="bank_name" label="Bank Name" style={{ flex: 1 }}>
                    <Input placeholder="e.g. First National Bank" />
                  </Form.Item>
                  <Form.Item name="account_type" label="Account Type" style={{ flex: 1 }}>
                    <Select>
                      <Option value="Checking">Checking</Option>
                      <Option value="Savings">Savings</Option>
                      <Option value="Money Market">Money Market</Option>
                      <Option value="Other">Other</Option>
                    </Select>
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="account_number" label="Account Number" style={{ flex: 1 }}>
                    <Input placeholder="XXXX XXXX XXXX" />
                  </Form.Item>
                  <Form.Item name="routing_number" label="Routing Number" style={{ flex: 1 }}>
                    <Input placeholder="XXXXXXXXX" maxLength={9} />
                  </Form.Item>
                  <Form.Item name="branch_code" label="Branch Code" style={{ flex: 1 }}>
                    <Input placeholder="Branch code" />
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name="opening_balance" label="Opening Balance" style={{ flex: 1 }}>
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                  <div style={{ flex: 1 }} />
                  <div style={{ flex: 1 }} />
                </div>
              </Card>
            )
          }
        ]} />
      </Form>
    </div>
  );
};

export default CompanySettings;
