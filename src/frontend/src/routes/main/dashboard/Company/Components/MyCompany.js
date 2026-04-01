import React, { useEffect, useState } from "react";
import { Card, Tabs, Form, Input, Button, Upload, message, Row, Col, Select } from "antd";
import { UploadOutlined } from "@ant-design/icons";

const { TabPane } = Tabs;
const { Option } = Select;

const MyCompany = () => {
  const [form] = Form.useForm();
  const [activeKey, setActiveKey] = useState("1");
  const [logoBase64, setLogoBase64] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await window.electronAPI.getCompany();
        if (data && !data.error) {
          // Map DB column names to form fields
          form.setFieldsValue({
            name: data.name,
            regNumber: data.reg_number,
            industry: data.industry,
            businessType: data.business_type,
            address: data.address,
            email: data.email,
            phone: data.phone,
            currency: data.currency,
            fyStart: data.fy_start,
            vat: data.vat_rate,
            terms: data.terms,
            bank: data.bank_name,
            accountNumber: data.account_number,
            branchCode: data.branch_code,
            payments: data.payments ? data.payments.split(',') : [],
          });
          if (data.logo) setLogoBase64(data.logo);
        }
      } catch (err) {
        // ignore
      }
    }
    load();
  }, [form]);

  // read upload as base64 and store in the form field `logo`
  const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
  });

  const beforeUpload = async (file) => {
    try {
      const base64 = await getBase64(file);
      setLogoBase64(base64);
      message.success(`${file.name} uploaded`);
    } catch (err) {
      message.error(`${file.name} upload failed`);
    }
    // prevent auto upload
    return false;
  };

  // single form instance shared across all tabs so validateFields() works everywhere
  return (
    <Card title="My Company Settings" bordered={false} style={{ margin: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type={activeKey === '1' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('1')}>
          Company Info
        </Button>
        <Button type={activeKey === '2' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('2')}>
          Financial Settings
        </Button>
        <Button type={activeKey === '3' ? 'primary' : 'default'} onClick={() => setActiveKey('3')}>
          Banking Details
        </Button>
      </div>

      {activeKey === '1' && (
        <div>
          <Form layout="vertical" form={form}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Company Name" name="name">
                  <Input placeholder="Enter company name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Registration Number" name="regNumber">
                  <Input placeholder="e.g. 2023/123456/07" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Industry" name="industry">
                  <Input placeholder="e.g. Construction, IT" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Business Type" name="businessType">
                  <Select placeholder="Select type">
                    <Option value="pty">Pty Ltd</Option>
                    <Option value="sole">Sole Proprietor</Option>
                    <Option value="ngo">Non-Profit</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Address" name="address">
                  <Input.TextArea rows={2} placeholder="Physical or postal address" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Email" name="email">
                  <Input placeholder="company@email.com" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Phone Number" name="phone">
                  <Input placeholder="e.g. +27 81 234 5678" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>Company Logo</label>
                  <Upload beforeUpload={beforeUpload} showUploadList={false} accept="image/*">
                    <Button icon={<UploadOutlined />}>Click to Upload Logo</Button>
                  </Upload>
                </div>
                {logoBase64 && (
                  <div style={{ marginBottom: 16 }}>
                    <img src={logoBase64} alt="Company Logo" style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', border: '1px solid #e8e8e8', borderRadius: 4, padding: 4 }} />
                  </div>
                )}
              </Col>
            </Row>
            <Form.Item>
                  <Button type="primary" onClick={async () => {
                try {
                  const values = await form.validateFields();
                  // Map form field names back to DB column names expected by backend
                  const payload = {
                    name: values.name,
                    reg_number: values.regNumber || '',
                    industry: values.industry || '',
                    business_type: values.businessType || '',
                    address: values.address || '',
                    email: values.email || '',
                    phone: values.phone || '',
                    logo: typeof logoBase64 === 'string' ? logoBase64 : '',
                    currency: values.currency || '',
                    fy_start: values.fyStart || '',
                    vat_rate: values.vat || 0,
                    terms: values.terms || 0,
                    bank_name: values.bank || '',
                    account_number: values.accountNumber || '',
                    branch_code: values.branchCode || '',
                    payments: Array.isArray(values.payments) ? values.payments.join(',') : (values.payments || ''),
                  };
                  const res = await window.electronAPI.saveCompany(payload);
                  if (res && res.success) {
                    message.success('Company info saved');
                  } else {
                    message.error('Failed to save company info');
                  }
                } catch (err) {
                  // validation error
                }
              }}>Save Company Info</Button>
            </Form.Item>
          </Form>
        </div>
      )}

      {activeKey === '2' && (
        <div>
          <Form layout="vertical" form={form}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Currency" name="currency">
                  <Select defaultValue="ZAR">
                    <Option value="ZAR">ZAR (South African Rand)</Option>
                    <Option value="USD">USD (US Dollar)</Option>
                    <Option value="EUR">EUR (Euro)</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Financial Year Start" name="fyStart">
                  <Input placeholder="e.g. January" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="VAT Rate (%)" name="vat">
                  <Input placeholder="e.g. 15" type="number" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Default Invoice Terms (Days)" name="terms">
                  <Input placeholder="e.g. 30" type="number" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item>
              <Button type="primary" onClick={async () => {
                try {
                  const values = await form.validateFields();
                  const payload = {
                    name: values.name,
                    reg_number: values.regNumber || '',
                    industry: values.industry || '',
                    business_type: values.businessType || '',
                    address: values.address || '',
                    email: values.email || '',
                    phone: values.phone || '',
                    logo: typeof logoBase64 === 'string' ? logoBase64 : '',
                    currency: values.currency || '',
                    fy_start: values.fyStart || '',
                    vat_rate: values.vat || 0,
                    terms: values.terms || 0,
                    bank_name: values.bank || '',
                    account_number: values.accountNumber || '',
                    branch_code: values.branchCode || '',
                    payments: Array.isArray(values.payments) ? values.payments.join(',') : (values.payments || ''),
                  };
                  const res = await window.electronAPI.saveCompany(payload);
                  if (res && res.success) message.success('Financial settings saved');
                  else message.error('Failed to save financial settings');
                } catch (err) {}
              }}>Save Financial Settings</Button>
            </Form.Item>
          </Form>
        </div>
      )}

      {activeKey === '3' && (
        <div>
          <Form layout="vertical" form={form}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Bank Name" name="bank">
                  <Input placeholder="e.g. FNB, Standard Bank" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Account Number" name="accountNumber">
                  <Input placeholder="Enter account number" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Branch Code" name="branchCode">
                  <Input placeholder="Enter branch code" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Payment Methods Enabled" name="payments">
                  <Select mode="multiple" placeholder="Select methods">
                    <Option value="EFT">EFT</Option>
                    <Option value="Cash">Cash</Option>
                    <Option value="Card">Card</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item>
              <Button type="primary" onClick={async () => {
                try {
                  const values = await form.validateFields();
                  const payload = {
                    name: values.name,
                    reg_number: values.regNumber || '',
                    industry: values.industry || '',
                    business_type: values.businessType || '',
                    address: values.address || '',
                    email: values.email || '',
                    phone: values.phone || '',
                    logo: typeof logoBase64 === 'string' ? logoBase64 : '',
                    currency: values.currency || '',
                    fy_start: values.fyStart || '',
                    vat_rate: values.vat || 0,
                    terms: values.terms || 0,
                    bank_name: values.bank || '',
                    account_number: values.accountNumber || '',
                    branch_code: values.branchCode || '',
                    payments: Array.isArray(values.payments) ? values.payments.join(',') : (values.payments || ''),
                  };
                  const res = await window.electronAPI.saveCompany(payload);
                  if (res && res.success) message.success('Banking info saved');
                  else message.error('Failed to save banking info');
                } catch (err) {}
              }}>Save Banking Info</Button>
            </Form.Item>
          </Form>
        </div>
      )}
    </Card>
  );
};

export default MyCompany;
