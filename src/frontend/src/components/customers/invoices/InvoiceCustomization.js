import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Row, Col, Button, Switch, ColorPicker, Upload, message, Divider, Space, Tabs } from 'antd';
import { SaveOutlined, EyeOutlined, UploadOutlined, UndoOutlined } from '@ant-design/icons';
import { handleDocumentPDF } from '../shared/generateDocumentPDF';
import { useCurrency } from '../../../utils/currency';

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const DEFAULT_SETTINGS = {
  // Branding
  logoBase64: '',
  primaryColor: '#2962FF',
  accentColor: '#f5f7fa',
  // Typography
  fontFamily: 'helvetica',
  headerFontSize: 18,
  bodyFontSize: 9,
  // Layout
  showLogo: true,
  showCompanyAddress: true,
  showCustomerEmail: true,
  showBillingAddress: true,
  // Columns
  showLineNumbers: true,
  showQuantity: true,
  showRate: true,
  showTax: true,
  // Footer
  footerText: 'Thank you for your business!',
  paymentInstructions: '',
  termsAndConditions: '',
  // Custom labels
  invoiceLabel: 'INVOICE',
  quoteLabel: 'QUOTE',
  billToLabel: 'BILL TO',
  dateLabel: 'DATE',
  dueDateLabel: 'DUE DATE',
  termsLabel: 'TERMS',
  notesLabel: 'NOTES',
};

const FONT_OPTIONS = [
  { value: 'helvetica', label: 'Helvetica (Default)' },
  { value: 'times', label: 'Times New Roman' },
  { value: 'courier', label: 'Courier' },
];

const InvoiceCustomization = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await window.electronAPI.getInvoiceTemplate?.();
      if (saved && typeof saved === 'object' && !saved.error) {
        const merged = { ...DEFAULT_SETTINGS, ...saved };
        setSettings(merged);
        form.setFieldsValue(merged);
      } else {
        form.setFieldsValue(DEFAULT_SETTINGS);
      }
    } catch {
      form.setFieldsValue(DEFAULT_SETTINGS);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = form.getFieldsValue(true);
      const merged = { ...settings, ...values };
      setSettings(merged);
      const res = await window.electronAPI.saveInvoiceTemplate?.(merged);
      if (res?.success || res) {
        message.success('Invoice template saved');
      } else {
        message.error(res?.error || 'Failed to save template');
      }
    } catch (e) {
      message.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    form.setFieldsValue(DEFAULT_SETTINGS);
    message.info('Reset to defaults (not saved yet)');
  };

  const handlePreview = () => {
    const values = form.getFieldsValue(true);
    const merged = { ...settings, ...values };
    handleDocumentPDF('preview', {
      docType: 'Invoice',
      header: {
        number: 'SAMPLE-001',
        status: 'Unpaid',
        date: new Date().toLocaleDateString(),
        dueDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        terms: 'Net 30',
        customerName: 'John Doe',
        email: 'john@example.com',
        billingAddress: '123 Main Street\nAnytown, ST 12345',
      },
      lines: [
        { description: 'Website Design', quantity: 1, rate: 2500, amount: 2500 },
        { description: 'Logo Design', quantity: 2, rate: 750, amount: 1500 },
        { description: 'Hosting (Monthly)', quantity: 12, rate: 25, amount: 300 },
      ],
      subtotal: 4300,
      vatPercent: 15,
      vatAmount: 645,
      grandTotal: 4945,
      message: merged.paymentInstructions || 'Payment is due within 30 days.',
      statementMemo: '',
      company: {
        name: 'Your Company Name',
        email: 'info@company.com',
        phone: '+1 555-1234',
        address: '456 Business Ave, Suite 100',
        logo: merged.logoBase64 || null,
      },
      currencySymbol: cSym,
      templateSettings: merged,
    });
  };

  const handleLogoUpload = (info) => {
    const file = info.file?.originFileObj || info.file;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      setSettings(prev => ({ ...prev, logoBase64: base64 }));
      form.setFieldsValue({ logoBase64: base64 });
      message.success('Logo uploaded');
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setSettings(prev => ({ ...prev, logoBase64: '' }));
    form.setFieldsValue({ logoBase64: '' });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Invoice Customization</h2>
        <Space>
          <Button icon={<UndoOutlined />} onClick={handleReset}>Reset to Defaults</Button>
          <Button icon={<EyeOutlined />} onClick={handlePreview}>Preview Sample</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>Save Template</Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" initialValues={settings}>
        <Tabs defaultActiveKey="1">
          <TabPane tab="Branding & Logo" key="1">
            <Card size="small">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="showLogo" label="Show Logo" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <div style={{ marginBottom: 16 }}>
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={() => false}
                      onChange={handleLogoUpload}
                    >
                      <Button icon={<UploadOutlined />}>Upload Logo</Button>
                    </Upload>
                    {settings.logoBase64 && (
                      <div style={{ marginTop: 8 }}>
                        <img src={settings.logoBase64} alt="Logo" style={{ maxWidth: 120, maxHeight: 60, border: '1px solid #eee', borderRadius: 4 }} />
                        <Button size="small" danger onClick={removeLogo} style={{ marginLeft: 8 }}>Remove</Button>
                      </div>
                    )}
                  </div>
                </Col>
                <Col span={12}>
                  <Form.Item name="primaryColor" label="Primary Color (Header/Accents)">
                    <Input type="color" style={{ width: 80, height: 36 }} />
                  </Form.Item>
                  <Form.Item name="accentColor" label="Alternate Row Color">
                    <Input type="color" style={{ width: 80, height: 36 }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Typography" key="2">
            <Card size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="fontFamily" label="Font Family">
                    <Select>
                      {FONT_OPTIONS.map(f => <Option key={f.value} value={f.value}>{f.label}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="headerFontSize" label="Header Font Size">
                    <Select>
                      {[14, 16, 18, 20, 22, 24].map(s => <Option key={s} value={s}>{s}pt</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="bodyFontSize" label="Body Font Size">
                    <Select>
                      {[8, 9, 10, 11, 12].map(s => <Option key={s} value={s}>{s}pt</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Layout & Columns" key="3">
            <Card size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="showCompanyAddress" label="Show Company Address" valuePropName="checked"><Switch /></Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="showCustomerEmail" label="Show Customer Email" valuePropName="checked"><Switch /></Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="showBillingAddress" label="Show Billing Address" valuePropName="checked"><Switch /></Form.Item>
                </Col>
              </Row>
              <Divider orientation="left">Table Columns</Divider>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item name="showLineNumbers" label="Line #" valuePropName="checked"><Switch /></Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="showQuantity" label="Quantity" valuePropName="checked"><Switch /></Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="showRate" label="Rate" valuePropName="checked"><Switch /></Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="showTax" label="Tax Column" valuePropName="checked"><Switch /></Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Labels" key="4">
            <Card size="small">
              <Row gutter={16}>
                <Col span={8}><Form.Item name="invoiceLabel" label="Invoice Title"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="quoteLabel" label="Quote Title"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="billToLabel" label="Bill To Label"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}><Form.Item name="dateLabel" label="Date Label"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="dueDateLabel" label="Due Date Label"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="termsLabel" label="Terms Label"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}><Form.Item name="notesLabel" label="Notes Label"><Input /></Form.Item></Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Footer & Terms" key="5">
            <Card size="small">
              <Form.Item name="footerText" label="Footer Message">
                <Input placeholder="e.g. Thank you for your business!" />
              </Form.Item>
              <Form.Item name="paymentInstructions" label="Payment Instructions (appears on invoice)">
                <TextArea rows={3} placeholder="e.g. Please pay via bank transfer to Account: 12345..." />
              </Form.Item>
              <Form.Item name="termsAndConditions" label="Terms & Conditions">
                <TextArea rows={4} placeholder="Your terms and conditions..." />
              </Form.Item>
            </Card>
          </TabPane>
        </Tabs>
      </Form>
    </div>
  );
};

export default InvoiceCustomization;
