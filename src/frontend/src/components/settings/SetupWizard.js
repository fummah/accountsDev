import React, { useState, useEffect } from 'react';
import {
  Form, Input, Select, Button, Upload, message, Row, Col, Progress, Tag, Tooltip,
  InputNumber, Divider, Switch
} from 'antd';
import {
  CheckCircleOutlined, RocketOutlined, BankOutlined, GlobalOutlined,
  TeamOutlined, FileTextOutlined, PictureOutlined, ArrowRightOutlined,
  ArrowLeftOutlined, BuildOutlined, ShopOutlined, CodeOutlined,
  HeartOutlined, HomeOutlined, CarOutlined, MedicineBoxOutlined,
  AppstoreOutlined, DollarOutlined, SettingOutlined, ThunderboltOutlined,
  CheckOutlined, LoadingOutlined, StarOutlined
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

const { Option } = Select;

/* ── Industry options with icons ── */
const INDUSTRIES = [
  { value: 'general',               label: 'General / Other',           icon: <AppstoreOutlined />,    color: '#8c8c8c' },
  { value: 'retail',                label: 'Retail / Wholesale',        icon: <ShopOutlined />,        color: '#fa8c16' },
  { value: 'professional-services', label: 'Professional Services',     icon: <FileTextOutlined />,    color: '#1890ff' },
  { value: 'construction',          label: 'Construction / Contracting',icon: <BuildOutlined />,       color: '#faad14' },
  { value: 'manufacturing',         label: 'Manufacturing',             icon: <SettingOutlined />,     color: '#722ed1' },
  { value: 'non-profit',            label: 'Non-Profit',                icon: <HeartOutlined />,       color: '#eb2f96' },
  { value: 'hospitality',           label: 'Hospitality / Restaurant',  icon: <HomeOutlined />,        color: '#13c2c2' },
  { value: 'healthcare',            label: 'Healthcare',                icon: <MedicineBoxOutlined />, color: '#52c41a' },
  { value: 'technology',            label: 'Technology / SaaS',         icon: <CodeOutlined />,        color: '#2f54eb' },
  { value: 'real-estate',           label: 'Real Estate',               icon: <HomeOutlined />,        color: '#d4380d' },
  { value: 'transport',             label: 'Transport / Logistics',     icon: <CarOutlined />,         color: '#096dd9' },
  { value: 'education',             label: 'Education',                 icon: <TeamOutlined />,        color: '#389e0d' },
];

/* ── COA Templates ── */
const COA_TEMPLATES = [
  { value: 'standard',      label: 'Standard Business',   desc: 'Full double-entry set for any business',       icon: <AppstoreOutlined />, color: '#1890ff', recommended: true },
  { value: 'service',       label: 'Service Business',    desc: 'Optimised for consultants & service firms',    icon: <FileTextOutlined />, color: '#52c41a' },
  { value: 'retail',        label: 'Retail / Wholesale',  desc: 'Inventory, COGS, and sales accounts included', icon: <ShopOutlined />,     color: '#fa8c16' },
  { value: 'non-profit',    label: 'Non-Profit',          desc: 'Fund accounting and donor management',         icon: <HeartOutlined />,    color: '#eb2f96' },
  { value: 'construction',  label: 'Construction',        desc: 'Job costing, subcontractors & WIP',            icon: <BuildOutlined />,    color: '#faad14' },
  { value: 'manufacturing', label: 'Manufacturing',       desc: 'Raw materials, WIP, finished goods',           icon: <SettingOutlined />,  color: '#722ed1' },
  { value: 'custom',        label: 'Start from Scratch',  desc: 'Build your own chart of accounts',             icon: <StarOutlined />,     color: '#8c8c8c' },
];

/* ── Currencies ── */
const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar ($)',           symbol: '$'  },
  { value: 'EUR', label: 'EUR — Euro (€)',                symbol: '€'  },
  { value: 'GBP', label: 'GBP — British Pound (£)',       symbol: '£'  },
  { value: 'ZAR', label: 'ZAR — South African Rand (R)',  symbol: 'R'  },
  { value: 'NGN', label: 'NGN — Nigerian Naira (₦)',      symbol: '₦'  },
  { value: 'CAD', label: 'CAD — Canadian Dollar (C$)',    symbol: 'C$' },
  { value: 'AUD', label: 'AUD — Australian Dollar (A$)',  symbol: 'A$' },
  { value: 'AED', label: 'AED — UAE Dirham (AED)',        symbol: 'AED'},
  { value: 'INR', label: 'INR — Indian Rupee (₹)',        symbol: '₹'  },
  { value: 'KES', label: 'KES — Kenyan Shilling (KSh)',   symbol: 'KSh'},
  { value: 'GHS', label: 'GHS — Ghanaian Cedi (₵)',       symbol: '₵'  },
  { value: 'EGP', label: 'EGP — Egyptian Pound (E£)',     symbol: 'E£' },
];

/* ── Sidebar step definitions ── */
const STEPS = [
  { key: 'welcome',   icon: <RocketOutlined />,   title: 'Welcome',         sub: 'Get started'           },
  { key: 'company',   icon: <BuildOutlined />,     title: 'Company Info',    sub: 'Name & details'        },
  { key: 'branding',  icon: <PictureOutlined />,   title: 'Branding',        sub: 'Logo & appearance'     },
  { key: 'industry',  icon: <ShopOutlined />,      title: 'Industry',        sub: 'Your business type'    },
  { key: 'accounts',  icon: <AppstoreOutlined />,  title: 'Chart of Accounts',sub: 'Select template'     },
  { key: 'currency',  icon: <GlobalOutlined />,    title: 'Currency & Tax',  sub: 'Localisation'          },
  { key: 'bank',      icon: <BankOutlined />,      title: 'Bank Account',    sub: 'Primary account'       },
  { key: 'finish',    icon: <CheckCircleOutlined />,title: 'All Done!',      sub: 'Start using the app'   },
];

/* ── Shared card picker style ── */
const PickerCard = ({ selected, onClick, icon, label, desc, color, badge }) => (
  <div
    onClick={onClick}
    style={{
      border: `2px solid ${selected ? color : '#e8e8e8'}`,
      borderRadius: 10,
      padding: '12px 14px',
      cursor: 'pointer',
      background: selected ? `${color}0d` : '#fff',
      transition: 'all 0.18s',
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}
  >
    <div style={{
      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
      background: selected ? color : '#f5f5f5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, color: selected ? '#fff' : color,
      transition: 'all 0.18s',
    }}>
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{label}</div>
      {desc && <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>}
    </div>
    {selected && (
      <div style={{
        position: 'absolute', top: 8, right: 8,
        width: 20, height: 20, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckOutlined style={{ color: '#fff', fontSize: 10 }} />
      </div>
    )}
    {badge && !selected && (
      <Tag color={color} style={{ position: 'absolute', top: 6, right: 6, fontSize: 10 }}>{badge}</Tag>
    )}
  </div>
);

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   Can be used as:
   - Standalone full-page: <SetupWizard />
   - Modal mode: <SetupWizard modal onComplete={fn} />
═══════════════════════════════════════════════════════════════════ */
const SetupWizard = ({ onComplete, modal = false }) => {
  const history = useHistory();
  const [step, setStep]           = useState(0);
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);
  const [logo, setLogo]           = useState(null);
  const [industry, setIndustry]   = useState('general');
  const [coaTemplate, setCoaTemplate] = useState('standard');
  const [accentColor, setAccentColor] = useState('#1890ff');

  const [companyForm] = Form.useForm();
  const [currencyForm] = Form.useForm();
  const [bankForm] = Form.useForm();

  const totalSteps = STEPS.length;
  const progress = Math.round((step / (totalSteps - 1)) * 100);

  useEffect(() => {
    (async () => {
      try {
        const comp = await window.electronAPI?.getCompany?.();
        if (comp?.name) {
          companyForm.setFieldsValue({
            name: comp.name, address: comp.address, phone: comp.phone,
            email: comp.email, website: comp.website, tax_id: comp.tax_id,
          });
        }
      } catch {}
    })();
  }, []);

  const getBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => resolve(r.result);
    r.onerror = reject;
  });

  /* ── Step navigation ── */
  const goNext = async () => {
    try {
      if (step === 1) {
        await companyForm.validateFields();
        const vals = companyForm.getFieldsValue();
        await window.electronAPI?.saveCompany?.({ ...vals, logo });
      }
      if (step === 2) {
        const vals = companyForm.getFieldsValue();
        await window.electronAPI?.saveCompany?.({ ...vals, logo });
        await window.electronAPI?.settingsSet?.('accent_color', accentColor);
      }
      if (step === 3) {
        const vals = companyForm.getFieldsValue();
        await window.electronAPI?.saveCompany?.({ ...vals, industry, logo });
      }
      if (step === 4) {
        await window.electronAPI?.coaSeedSystemAccounts?.();
        await window.electronAPI?.settingsSet?.('coa_template', coaTemplate);
      }
      if (step === 5) {
        const vals = currencyForm.getFieldsValue();
        if (vals.base_currency) await window.electronAPI?.currencySetBase?.(vals.base_currency);
        await window.electronAPI?.settingsSet?.('date_format', vals.date_format || 'MM/DD/YYYY');
        await window.electronAPI?.settingsSet?.('tax_jurisdiction', vals.jurisdiction || 'US');
        await window.electronAPI?.settingsSet?.('fiscal_year_start', vals.fiscal_year_start || 'january');
        const compVals = companyForm.getFieldsValue();
        await window.electronAPI?.saveCompany?.({
          ...compVals, industry, logo, currency: vals.base_currency || '',
          vat_rate: vals.tax_rate != null ? vals.tax_rate : 0,
          tax_name: vals.tax_name || 'VAT',
          fy_start: vals.fiscal_year_start || '',
          terms: vals.terms != null ? vals.terms : 30,
        });
      }
      if (step === 6) {
        const vals = bankForm.getFieldsValue();
        if (vals.account_name) {
          await window.electronAPI?.insertChartAccount?.({
            name: vals.account_name, type: 'Bank',
            number: vals.routing_number || null,
            status: 'Active',
            openingBalance: Number(vals.opening_balance) || 0,
            normalBalance: 'Debit',
            description: vals.bank_name || '',
          });
        }
        const compVals = companyForm.getFieldsValue();
        await window.electronAPI?.saveCompany?.({
          ...compVals, industry, logo,
          bank_name: vals.bank_name || '',
          account_number: vals.account_number || '',
          branch_code: vals.branch_code || '',
          routing_number: vals.routing_number || '',
          account_type: vals.account_type || 'Checking',
          opening_balance: Number(vals.opening_balance) || 0,
        });
      }
      setStep(s => Math.min(s + 1, totalSteps - 1));
    } catch (err) {
      console.error('[SetupWizard] Step save failed:', err);
      message.error('Failed to save: ' + (err?.message || 'Unknown error'));
    }
  };

  const goBack = () => setStep(s => Math.max(s - 1, 0));

  /* ── Finish ── */
  const finish = async () => {
    setSaving(true);
    try {
      // Final comprehensive save of all company data
      const compVals = companyForm.getFieldsValue();
      const currVals = currencyForm.getFieldsValue();
      const bankVals = bankForm.getFieldsValue();
      await window.electronAPI?.saveCompany?.({
        ...compVals,
        industry,
        logo,
        currency: currVals.base_currency || '',
        vat_rate: currVals.tax_rate || 0,
        tax_name: currVals.tax_name || 'VAT',
        fy_start: currVals.fiscal_year_start || '',
        terms: currVals.terms != null ? currVals.terms : 30,
        bank_name: bankVals.bank_name || '',
        account_number: bankVals.account_number || '',
        branch_code: bankVals.branch_code || '',
        routing_number: bankVals.routing_number || '',
        account_type: bankVals.account_type || 'Checking',
        opening_balance: Number(bankVals.opening_balance) || 0,
      });

      // Persist all global settings (in case user jumped steps)
      if (currVals.base_currency) {
        await window.electronAPI?.currencySetBase?.(currVals.base_currency);
        await window.electronAPI?.settingsSet?.('base_currency', currVals.base_currency);
      }
      if (currVals.date_format)        await window.electronAPI?.settingsSet?.('date_format', currVals.date_format);
      if (currVals.jurisdiction)        await window.electronAPI?.settingsSet?.('tax_jurisdiction', currVals.jurisdiction);
      if (currVals.fiscal_year_start)   await window.electronAPI?.settingsSet?.('fiscal_year_start', currVals.fiscal_year_start);
      if (accentColor)                  await window.electronAPI?.settingsSet?.('accent_color', accentColor);
      if (coaTemplate)                  await window.electronAPI?.settingsSet?.('coa_template', coaTemplate);

      // Seed system accounts if not yet done
      await window.electronAPI?.coaSeedSystemAccounts?.().catch(() => {});

      // Create bank account in COA if provided
      if (bankVals.account_name) {
        try {
          await window.electronAPI?.insertChartAccount?.({
            name: bankVals.account_name, type: 'Bank',
            number: bankVals.routing_number || null,
            status: 'Active',
            openingBalance: Number(bankVals.opening_balance) || 0,
            normalBalance: 'Debit',
            description: bankVals.bank_name || '',
          });
        } catch {} // may already exist
      }

      await window.electronAPI?.setupWizardComplete?.({
        company: compVals,
        industry,
        coaTemplate,
        currency: currVals,
        bank: bankVals,
        logo,
        accentColor,
      });
      message.success('Setup complete! Welcome aboard 🎉');
      setDone(true);
      if (onComplete) onComplete();
    } catch (e) {
      message.error('Setup failed: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  /* ── Accent colour options ── */
  const ACCENT_COLORS = ['#1890ff','#52c41a','#722ed1','#fa8c16','#eb2f96','#13c2c2','#f5222d','#2f54eb'];

  /* ══════ Step content renderers ══════ */

  const stepContent = () => {
    switch (step) {
      /* 0 — Welcome */
      case 0:
        return (
          <div style={{ textAlign: 'center', padding: '20px 0 0' }}>
            <div style={{
              width: 90, height: 90, borderRadius: '50%', margin: '0 auto 20px',
              background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RocketOutlined style={{ fontSize: 40, color: '#fff' }} />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>Welcome to AccountsPro</h2>
            <p style={{ color: '#666', fontSize: 15, maxWidth: 420, margin: '0 auto 28px', lineHeight: 1.7 }}>
              Let's get your business set up in just a few minutes. We'll walk you through everything step by step.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
              {[
                { icon: <BuildOutlined />, label: 'Company Profile',  color: '#1890ff' },
                { icon: <AppstoreOutlined />, label: 'Chart of Accounts', color: '#52c41a' },
                { icon: <GlobalOutlined />, label: 'Currency & Tax',  color: '#fa8c16' },
                { icon: <BankOutlined />, label: 'Bank Account',      color: '#722ed1' },
              ].map((f, i) => (
                <div key={i} style={{
                  background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 10,
                  padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ color: f.color, fontSize: 18 }}>{f.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#aaa' }}>Takes about 3 minutes &nbsp;·&nbsp; All fields can be edited later</p>
          </div>
        );

      /* 1 — Company Info */
      case 1:
        return (
          <Form form={companyForm} layout="vertical">
            <Row gutter={16}>
              <Col span={14}>
                <Form.Item name="name" label="Company Name" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="My Business Pty Ltd" size="large" />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item name="tax_id" label="Tax ID / EIN">
                  <Input placeholder="XX-XXXXXXX" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="address" label="Business Address">
              <Input.TextArea rows={2} placeholder="123 Main Street, City, State, ZIP" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="phone" label="Phone">
                  <Input placeholder="+1 (555) 123-4567" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="email" label="Business Email">
                  <Input placeholder="info@yourbusiness.com" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="website" label="Website">
                  <Input placeholder="www.yourbusiness.com" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="reg_number" label="Registration Number">
                  <Input placeholder="Company registration #" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="business_type" label="Business Type">
                  <Select placeholder="Select business type">
                    <Option value="pty">Pty Ltd</Option>
                    <Option value="sole">Sole Proprietor</Option>
                    <Option value="ngo">Non-Profit</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        );

      /* 2 — Branding */
      case 2:
        return (
          <div>
            <p style={{ color: '#666', marginBottom: 20 }}>Upload your logo and choose an accent colour. These will appear on invoices and reports.</p>
            <div style={{ display: 'flex', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
              {/* Logo upload */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Company Logo</div>
                <Upload
                  accept="image/*" showUploadList={false}
                  beforeUpload={async (file) => {
                    try { const b64 = await getBase64(file); setLogo(b64); message.success('Logo uploaded'); } catch { message.error('Upload failed'); }
                    return false;
                  }}
                >
                  <div style={{
                    width: 140, height: 100, border: '2px dashed #d9d9d9', borderRadius: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: '#fafafa', transition: 'border-color 0.2s',
                    overflow: 'hidden',
                  }}>
                    {logo
                      ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <><PictureOutlined style={{ fontSize: 28, color: '#bbb', marginBottom: 4 }} /><span style={{ fontSize: 11, color: '#aaa' }}>Click to upload</span></>
                    }
                  </div>
                </Upload>
                {logo && <Button size="small" type="link" danger onClick={() => setLogo(null)} style={{ paddingLeft: 0, marginTop: 4 }}>Remove</Button>}
              </div>
              {/* Accent colour */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Accent Colour</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 220 }}>
                  {ACCENT_COLORS.map(c => (
                    <Tooltip key={c} title={c}>
                      <div onClick={() => setAccentColor(c)} style={{
                        width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: accentColor === c ? '3px solid #1a1a1a' : '3px solid transparent',
                        transition: 'border 0.15s', boxSizing: 'border-box',
                      }} />
                    </Tooltip>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>Selected: <span style={{ fontWeight: 600, color: accentColor }}>{accentColor}</span></div>
              </div>
            </div>
            {/* Preview card */}
            <div style={{
              border: `2px solid ${accentColor}`, borderRadius: 10, padding: '16px 20px',
              background: '#fafafa', display: 'flex', alignItems: 'center', gap: 16,
            }}>
              {logo
                ? <img src={logo} alt="logo" style={{ height: 44, objectFit: 'contain' }} />
                : <div style={{ width: 44, height: 44, borderRadius: 8, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BuildOutlined style={{ color: '#fff', fontSize: 20 }} />
                  </div>
              }
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: accentColor }}>
                  {companyForm.getFieldValue('name') || 'Your Company Name'}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>Invoice Preview</div>
              </div>
            </div>
          </div>
        );

      /* 3 — Industry */
      case 3:
        return (
          <div>
            <p style={{ color: '#666', marginBottom: 16 }}>Select the industry that best describes your business. This helps us tailor your chart of accounts.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {INDUSTRIES.map(ind => (
                <PickerCard
                  key={ind.value}
                  selected={industry === ind.value}
                  onClick={() => {
                    setIndustry(ind.value);
                    const match = COA_TEMPLATES.find(t => t.value === ind.value.split('-')[0]);
                    if (match) setCoaTemplate(match.value);
                  }}
                  icon={ind.icon}
                  label={ind.label}
                  color={ind.color}
                />
              ))}
            </div>
          </div>
        );

      /* 4 — Chart of Accounts */
      case 4:
        return (
          <div>
            <p style={{ color: '#666', marginBottom: 16 }}>Choose a Chart of Accounts template. You can add, edit or remove accounts at any time.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {COA_TEMPLATES.map(t => (
                <PickerCard
                  key={t.value}
                  selected={coaTemplate === t.value}
                  onClick={() => setCoaTemplate(t.value)}
                  icon={t.icon}
                  label={t.label}
                  desc={t.desc}
                  color={t.color}
                  badge={t.recommended ? 'Recommended' : null}
                />
              ))}
            </div>
          </div>
        );

      /* 5 — Currency & Tax */
      case 5:
        return (
          <Form form={currencyForm} layout="vertical"
            initialValues={{ base_currency: 'USD', jurisdiction: 'US', fiscal_year_start: 'january', date_format: 'MM/DD/YYYY', tax_rate: 0 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="base_currency" label="Base Currency" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label"
                    options={CURRENCIES.map(c => ({ value: c.value, label: c.label }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="jurisdiction" label="Tax Jurisdiction">
                  <Select showSearch>
                    <Option value="US">🇺🇸 United States</Option>
                    <Option value="UK">🇬🇧 United Kingdom</Option>
                    <Option value="CA">🇨🇦 Canada</Option>
                    <Option value="AU">🇦🇺 Australia</Option>
                    <Option value="ZA">🇿🇦 South Africa</Option>
                    <Option value="NG">🇳🇬 Nigeria</Option>
                    <Option value="GH">🇬🇭 Ghana</Option>
                    <Option value="KE">🇰🇪 Kenya</Option>
                    <Option value="AE">🇦🇪 UAE</Option>
                    <Option value="IN">🇮🇳 India</Option>
                    <Option value="EG">🇪🇬 Egypt</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="fiscal_year_start" label="Fiscal Year Start">
                  <Select>
                    {['january','february','march','april','may','june','july','august','september','october','november','december'].map(m => (
                      <Option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="date_format" label="Date Format">
                  <Select>
                    <Option value="MM/DD/YYYY">MM/DD/YYYY (US)</Option>
                    <Option value="DD/MM/YYYY">DD/MM/YYYY (UK / Africa / EU)</Option>
                    <Option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</Option>
                    <Option value="DD.MM.YYYY">DD.MM.YYYY (German)</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="tax_rate" label="Default Tax Rate (%)">
                  <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} formatter={v => `${v}%`} parser={v => v.replace('%', '')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tax_name" label="Tax Name (e.g. VAT, GST, Sales Tax)">
                  <Input placeholder="VAT" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="terms" label="Default Invoice Terms (Days)" initialValue={30}>
                  <InputNumber min={0} max={365} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        );

      /* 6 — Bank Account */
      case 6:
        return (
          <Form form={bankForm} layout="vertical"
            initialValues={{ account_name: 'Business Checking', opening_balance: 0 }}>
            <p style={{ color: '#666', marginBottom: 16 }}>Set up your primary bank account. This will be added to your Chart of Accounts. You can add more later.</p>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="bank_name" label="Bank Name">
                  <Input placeholder="e.g. First National Bank" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="account_name" label="Account Name" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="e.g. Business Checking" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="account_number" label="Account Number">
                  <Input placeholder="XXXX XXXX XXXX" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="routing_number" label="Routing Number">
                  <Input placeholder="XXXXXXXXX" maxLength={9} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="opening_balance" label="Opening Balance">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="$" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="account_type" label="Account Type" initialValue="Checking">
                  <Select>
                    <Option value="Checking">Checking</Option>
                    <Option value="Savings">Savings</Option>
                    <Option value="Money Market">Money Market</Option>
                    <Option value="Other">Other</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="skip_bank" label=" " colon={false}>
                  <div style={{ paddingTop: 6 }}>
                    <Switch
                      size="small"
                      onChange={v => bankForm.setFieldsValue({ _skip: v })}
                    />
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>Skip — add bank account later</span>
                  </div>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        );

      /* 7 — Done */
      case 7:
        return (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #52c41a 0%, #1890ff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircleOutlined style={{ fontSize: 40, color: '#fff' }} />
            </div>
            <h2 style={{ margin: '0 0 6px', fontWeight: 700 }}>You're All Set!</h2>
            <p style={{ color: '#666', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Your workspace has been configured. Here's what you can do next:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, maxWidth: 480, margin: '0 auto 24px', textAlign: 'left' }}>
              {[
                { icon: <FileTextOutlined />, label: 'Create Invoice',    route: '/inner/sales?tab=2',                    color: '#1890ff' },
                { icon: <DollarOutlined />,   label: 'Enter a Bill',      route: '/inner/expenses',                       color: '#fa8c16' },
                { icon: <AppstoreOutlined />, label: 'Chart of Accounts', route: '/main/accountant/chart-of-accounts',    color: '#52c41a' },
                { icon: <BankOutlined />,     label: 'Banking',           route: '/main/banking/reconcile',               color: '#722ed1' },
                { icon: <TeamOutlined />,     label: 'Add Customers',     route: '/main/customers/center',                color: '#eb2f96' },
                { icon: <ThunderboltOutlined />,label: 'Run Reports',     route: '/main/accountant/reports',              color: '#13c2c2' },
              ].map((a, i) => (
                <div key={i}
                  onClick={() => { if (history) { if (onComplete) onComplete(); history.push(a.route); } }}
                  style={{
                    border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    transition: 'all 0.15s', background: '#fff',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.background = `${a.color}0d`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.background = '#fff'; }}
                >
                  <span style={{ fontSize: 20, color: a.color }}>{a.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        );

      default: return null;
    }
  };

  /* ══════ Layout ══════ */
  const containerStyle = modal
    ? { display: 'flex', minHeight: 520, overflow: 'hidden' }
    : { display: 'flex', minHeight: '100vh', background: '#f0f2f5' };

  return (
    <div style={containerStyle}>

      {/* ── Left Sidebar ── */}
      <div style={{
        width: 220, flexShrink: 0,
        background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        padding: '32px 0', display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo area */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, #1890ff, #722ed1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RocketOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>AccountsPro</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Setup Wizard</div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Progress</span>
            <span style={{ color: '#1890ff', fontSize: 11, fontWeight: 600 }}>{progress}%</span>
          </div>
          <Progress percent={progress} showInfo={false} strokeColor="#1890ff" trailColor="rgba(255,255,255,0.1)" size="small" />
        </div>

        {/* Steps list */}
        <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
          {STEPS.map((s, i) => {
            const isPast    = i < step;
            const isCurrent = i === step;
            const isFuture  = i > step;
            return (
              <div key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                background: isCurrent ? 'rgba(24,144,255,0.18)' : 'transparent',
                cursor: isPast ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
                onClick={() => isPast && setStep(i)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  background: isPast ? '#52c41a' : isCurrent ? '#1890ff' : 'rgba(255,255,255,0.07)',
                  color: (isPast || isCurrent) ? '#fff' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.2s',
                }}>
                  {isPast ? <CheckOutlined style={{ fontSize: 11 }} /> : s.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? '#fff' : isPast ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                    lineHeight: 1.3,
                  }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.2 }}>{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step counter */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Step {step + 1} of {totalSteps}</span>
        </div>
      </div>

      {/* ── Right Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          padding: '20px 32px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
        }}>
          <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Step {step + 1} — {STEPS[step].sub}
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{STEPS[step].title}</h2>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {stepContent()}
        </div>

        {/* Bottom nav */}
        <div style={{
          padding: '16px 32px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fafafa',
        }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={goBack}
            disabled={step === 0}
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            Back
          </Button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Dot indicators */}
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i < step ? '#52c41a' : i === step ? '#1890ff' : '#e8e8e8',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          {step < totalSteps - 1 ? (
            <Button type="primary" onClick={goNext} icon={<ArrowRightOutlined />} iconPosition="end">
              {step === 0 ? 'Get Started' : 'Continue'}
            </Button>
          ) : done ? (
            <Button type="primary" icon={<CheckCircleOutlined />}
              onClick={() => { if (onComplete) onComplete(); if (history) history.push('/main/dashboard'); }}>
              Go to Dashboard
            </Button>
          ) : (
            <Button type="primary" loading={saving} icon={saving ? <LoadingOutlined /> : <CheckCircleOutlined />} onClick={finish}>
              {saving ? 'Finishing...' : 'Complete Setup'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
