import React, { useState, useEffect } from 'react';
import { Steps, Card, Button, Form, Input, Select, message, Result, Row, Col, Radio, Divider } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const { Step } = Steps;
const { Option } = Select;

const INDUSTRY_OPTIONS = [
  { value: 'general', label: 'General / Other' },
  { value: 'retail', label: 'Retail' },
  { value: 'professional-services', label: 'Professional Services' },
  { value: 'construction', label: 'Construction / Contracting' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'non-profit', label: 'Non-Profit Organization' },
  { value: 'hospitality', label: 'Hospitality / Restaurant' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'technology', label: 'Technology / SaaS' },
  { value: 'real-estate', label: 'Real Estate / Property' },
];

const COA_TEMPLATES = [
  { value: 'standard', label: 'Standard Business' },
  { value: 'retail', label: 'Retail / Wholesale' },
  { value: 'service', label: 'Service Business' },
  { value: 'non-profit', label: 'Non-Profit' },
  { value: 'construction', label: 'Construction' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'custom', label: 'Start from Scratch' },
];

const SetupWizard = ({ onComplete }) => {
  const [current, setCurrent] = useState(0);
  const [companyForm] = Form.useForm();
  const [taxForm] = Form.useForm();
  const [bankForm] = Form.useForm();
  const [wizardData, setWizardData] = useState({});
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    loadExisting();
  }, []);

  const loadExisting = async () => {
    try {
      const comp = await window.electronAPI.getCompany?.();
      if (comp) {
        companyForm.setFieldsValue({
          name: comp.name,
          address: comp.address,
          phone: comp.phone,
          email: comp.email,
          website: comp.website,
          tax_id: comp.tax_id,
        });
      }
    } catch {}
  };

  const steps = [
    {
      title: 'Company',
      content: (
        <Form form={companyForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Company Name" rules={[{ required: true, message: 'Enter company name' }]}>
                <Input placeholder="Your Business Name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="industry" label="Industry" initialValue="general">
                <Select>
                  {INDUSTRY_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="address" label="Business Address">
                <Input.TextArea rows={2} placeholder="Street address, City, State, ZIP" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="+1 (555) 123-4567" />
              </Form.Item>
              <Form.Item name="email" label="Email">
                <Input placeholder="info@yourbusiness.com" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tax_id" label="Tax ID / EIN">
                <Input placeholder="XX-XXXXXXX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label="Website">
                <Input placeholder="www.yourbusiness.com" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ),
    },
    {
      title: 'Chart of Accounts',
      content: (
        <div>
          <p style={{ marginBottom: 16 }}>Select a Chart of Accounts template that best matches your business type. You can customize it later.</p>
          <Form.Item>
            <Radio.Group
              value={wizardData.coaTemplate || 'standard'}
              onChange={e => setWizardData(prev => ({ ...prev, coaTemplate: e.target.value }))}
              style={{ width: '100%' }}
            >
              {COA_TEMPLATES.map(t => (
                <Radio key={t.value} value={t.value} style={{ display: 'block', marginBottom: 12, padding: '8px 12px', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                  {t.label}
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        </div>
      ),
    },
    {
      title: 'Currency & Tax',
      content: (
        <Form form={taxForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="base_currency" label="Base Currency" initialValue="USD">
                <Select showSearch placeholder="Select currency">
                  <Option value="USD">USD - US Dollar ($)</Option>
                  <Option value="GBP">GBP - British Pound (£)</Option>
                  <Option value="EUR">EUR - Euro (€)</Option>
                  <Option value="ZAR">ZAR - South African Rand (R)</Option>
                  <Option value="NGN">NGN - Nigerian Naira (₦)</Option>
                  <Option value="CAD">CAD - Canadian Dollar (C$)</Option>
                  <Option value="AUD">AUD - Australian Dollar (A$)</Option>
                  <Option value="AED">AED - UAE Dirham</Option>
                  <Option value="INR">INR - Indian Rupee (₹)</Option>
                  <Option value="KES">KES - Kenyan Shilling (KSh)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="jurisdiction" label="Tax Jurisdiction" initialValue="US">
                <Select showSearch placeholder="Select jurisdiction">
                  <Option value="US">United States</Option>
                  <Option value="UK">United Kingdom</Option>
                  <Option value="CA">Canada</Option>
                  <Option value="AU">Australia</Option>
                  <Option value="ZA">South Africa</Option>
                  <Option value="NG">Nigeria</Option>
                  <Option value="AE">UAE</Option>
                  <Option value="CA-ON">Canada - Ontario</Option>
                  <Option value="CA-BC">Canada - British Columbia</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="fiscal_year_start" label="Fiscal Year Start" initialValue="january">
                <Select>
                  <Option value="january">January</Option>
                  <Option value="february">February</Option>
                  <Option value="march">March</Option>
                  <Option value="april">April</Option>
                  <Option value="july">July</Option>
                  <Option value="october">October</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_format" label="Date Format" initialValue="MM/DD/YYYY">
                <Select>
                  <Option value="MM/DD/YYYY">MM/DD/YYYY (US)</Option>
                  <Option value="DD/MM/YYYY">DD/MM/YYYY (UK/EU/Africa)</Option>
                  <Option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</Option>
                  <Option value="DD.MM.YYYY">DD.MM.YYYY (German)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ),
    },
    {
      title: 'Bank Account',
      content: (
        <Form form={bankForm} layout="vertical">
          <p style={{ marginBottom: 16 }}>Set up your primary bank account. You can add more accounts later.</p>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bank_name" label="Bank Name">
                <Input placeholder="e.g. First National Bank" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="account_name" label="Account Name" initialValue="Primary Checking">
                <Input placeholder="e.g. Business Checking" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="account_number" label="Account Number">
                <Input placeholder="XXXX-XXXX-XXXX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="opening_balance" label="Opening Balance">
                <Input type="number" placeholder="0.00" prefix="$" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ),
    },
    {
      title: 'Finish',
      content: (
        <Result
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="You're All Set!"
          subTitle="Your company has been configured. You can now start using the system."
          extra={
            <div style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto' }}>
              <h4>Quick Start Guide:</h4>
              <ul style={{ lineHeight: 2 }}>
                <li><strong>Create an Invoice</strong> — Customers → Invoices → Create Invoice</li>
                <li><strong>Record an Expense</strong> — Vendors → Enter Bill</li>
                <li><strong>Add Products</strong> — Inventory → Products → Add Product</li>
                <li><strong>Run Reports</strong> — Reports → Profit & Loss</li>
                <li><strong>Import Data</strong> — Accountant → QuickBooks Import</li>
              </ul>
            </div>
          }
        />
      ),
    },
  ];

  const next = async () => {
    if (current === 0) {
      try {
        const vals = await companyForm.validateFields();
        setWizardData(prev => ({ ...prev, company: vals }));
        // Save company info
        try {
          await window.electronAPI.saveCompany?.(vals);
        } catch {}
      } catch {
        return;
      }
    }
    if (current === 2) {
      const vals = taxForm.getFieldsValue();
      setWizardData(prev => ({ ...prev, tax: vals }));
      // Set base currency
      try {
        if (vals.base_currency) await window.electronAPI.currencySetBase?.(vals.base_currency);
      } catch {}
      // Save date format preference
      try {
        if (vals.date_format) await window.electronAPI.settingsSet?.('date_format', vals.date_format);
        if (vals.jurisdiction) await window.electronAPI.settingsSet?.('tax_jurisdiction', vals.jurisdiction);
        if (vals.fiscal_year_start) await window.electronAPI.settingsSet?.('fiscal_year_start', vals.fiscal_year_start);
      } catch {}
    }
    if (current === 3) {
      const vals = bankForm.getFieldsValue();
      setWizardData(prev => ({ ...prev, bank: vals }));
      // Create bank account in COA if provided
      try {
        if (vals.account_name) {
          await window.electronAPI.insertChartAccount?.(vals.account_name || 'Primary Checking', 'Bank', null, 'setup-wizard');
        }
      } catch {}
    }
    setCurrent(current + 1);
  };

  const prev = () => setCurrent(current - 1);

  const finish = async () => {
    setLoading(true);
    try {
      // Seed industry-specific report templates if applicable
      const industry = wizardData.company?.industry;
      if (industry && industry !== 'general') {
        try {
          await window.electronAPI.industryTemplatesSeed?.(industry);
        } catch {}
      }
      // Mark wizard as complete
      await window.electronAPI.setupWizardComplete?.(wizardData);
      setCompleted(true);
      message.success('Setup completed successfully!');
      if (onComplete) onComplete();
    } catch (err) {
      message.error('Failed to complete setup: ' + err.message);
    }
    setLoading(false);
  };

  if (completed) {
    return (
      <Card title="Setup Complete" style={{ margin: 24 }}>
        <Result status="success" title="Your workspace is ready!" subTitle="Start managing your business finances." />
      </Card>
    );
  }

  return (
    <Card title="Company Setup Wizard" style={{ margin: 24 }}>
      <Steps current={current} style={{ marginBottom: 32 }}>
        {steps.map(s => <Step key={s.title} title={s.title} />)}
      </Steps>
      <div style={{ minHeight: 300, padding: '16px 0' }}>
        {steps[current].content}
      </div>
      <Divider />
      <div style={{ textAlign: 'right' }}>
        {current > 0 && current < steps.length - 1 && (
          <Button style={{ marginRight: 8 }} onClick={prev}>Previous</Button>
        )}
        {current < steps.length - 1 && (
          <Button type="primary" onClick={next}>Next</Button>
        )}
        {current === steps.length - 1 && (
          <Button type="primary" loading={loading} onClick={finish}>Complete Setup</Button>
        )}
      </div>
    </Card>
  );
};

export default SetupWizard;
