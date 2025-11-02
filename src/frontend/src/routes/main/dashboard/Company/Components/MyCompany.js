import React, { useEffect } from "react";
import { Card, Tabs, Form, Input, Button, Upload, message, Row, Col, Select } from "antd";
import { UploadOutlined } from "@ant-design/icons";

const { TabPane } = Tabs;
const { Option } = Select;

const MyCompany = () => {
  const [form] = Form.useForm();

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
            logo: data.logo,
            currency: data.currency,
            fyStart: data.fy_start,
            vat: data.vat_rate,
            terms: data.terms,
            bank: data.bank_name,
            accountNumber: data.account_number,
            branchCode: data.branch_code,
            payments: data.payments ? data.payments.split(',') : [],
          });
        }
      } catch (err) {
        // ignore
      }
    }
    load();
  }, [form]);

  const handleUpload = (info) => {
    if (info.file.status !== "uploading") {
      console.log(info.file, info.fileList);
    }
    if (info.file.status === "done") {
      message.success(`${info.file.name} file uploaded successfully`);
    } else if (info.file.status === "error") {
      message.error(`${info.file.name} file upload failed.`);
    }
  };

  return (
    <Card title="My Company Settings" bordered={false} style={{ margin: 24 }}>
      <Tabs defaultActiveKey="1">
        <TabPane tab="Company Info" key="1">
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
                <Form.Item label="Company Logo" name="logo">
                  <Upload name="logo" action="/upload.do" onChange={handleUpload}>
                    <Button icon={<UploadOutlined />}>Click to Upload</Button>
                  </Upload>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item>
              <Button type="primary" onClick={async () => {
                try {
                  const values = await form.validateFields();
                  // build payload
                  const payload = {
                    ...values,
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
        </TabPane>

        <TabPane tab="Financial Settings" key="2">
          <Form layout="vertical">
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
                  const res = await window.electronAPI.saveCompany(values);
                  if (res && res.success) message.success('Financial settings saved');
                  else message.error('Failed to save financial settings');
                } catch (err) {}
              }}>Save Financial Settings</Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="Banking Details" key="3">
          <Form layout="vertical">
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
                  const res = await window.electronAPI.saveCompany(values);
                  if (res && res.success) message.success('Banking info saved');
                  else message.error('Failed to save banking info');
                } catch (err) {}
              }}>Save Banking Info</Button>
            </Form.Item>
          </Form>
        </TabPane>

      </Tabs>
    </Card>
  );
};

export default MyCompany;
