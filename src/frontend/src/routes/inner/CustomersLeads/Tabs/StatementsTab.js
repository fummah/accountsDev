import React, { useState, useEffect } from "react";
import {
  Card,
  DatePicker,
  Form,
  Button,
  Select,
  Input,
  Table,
  message,
} from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import moment from "moment";

const { RangePicker } = DatePicker;
const { Option } = Select;

const mockData = [
  {
    key: "1",
    date: "2025-08-01",
    description: "Invoice #1001",
    debit: 0,
    credit: 1200,
    balance: 1200,
  },
  {
    key: "2",
    date: "2025-08-02",
    description: "Payment Received",
    debit: 1200,
    credit: 0,
    balance: 0,
  },
];

const columns = [
  {
    title: "Date",
    dataIndex: "date",
    key: "date",
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
  },
  {
    title: "Debit",
    dataIndex: "debit",
    key: "debit",
    render: (val) => `R ${val.toFixed(2)}`,
  },
  {
    title: "Credit",
    dataIndex: "credit",
    key: "credit",
    render: (val) => `R ${val.toFixed(2)}`,
  },
  {
    title: "Balance",
    dataIndex: "balance",
    key: "balance",
    render: (val) => `R ${val.toFixed(2)}`,
  },
];

const StatementsTab = () => {
  const [form] = Form.useForm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const response = await window.electronAPI.getAllCustomers();
      setCustomers(response.all || []);
    } catch (error) {
      message.error('Failed to load customers');
      console.error('Error loading customers:', error);
    }
  };

  const generateStatement = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Convert date range to start_date and last_date format
      const [startDate, endDate] = values.dateRange;
      const statementData = {
        customerId: values.customer,
        start_date: startDate.format('YYYY-MM-DD'),
        last_date: endDate.format('YYYY-MM-DD'),
        email: values.email
      };

      const response = await window.electronAPI.createStatement(statementData);
      
      if (response.success) {
        setData(response.data);
        message.success("Statement generated successfully");
      } else {
        console.log('Error generating statement:', response);
        message.error(response.error || "Failed to generate statement");
      }
    } catch (error) {
      console.log('Error generating statement:', error);
      message.error(error.message || "Please fill in all required fields.");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    try {
      // You can implement PDF export using the statement data
      const values = await form.getFieldsValue();
      // Implement PDF generation logic here
      message.success("PDF export started...");
    } catch (error) {
      message.error("Failed to export PDF");
      console.error('PDF export error:', error);
    }
  };

  return (
    <Card title="Generate Statement" bordered>
      <Form layout="vertical" form={form}>
        <Form.Item
          name="customer"
          label="Customer"
          rules={[{ required: true, message: "Please select a customer" }]}
        >
          <Select 
            placeholder="Select customer"
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {customers.map(customer => (
              <Option key={customer.id} value={customer.id}>
                {customer.company_name || `${customer.first_name} ${customer.last_name}`}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="dateRange"
          label="Statement Period"
          rules={[{ required: true, message: "Please select date range" }]}
        >
          <RangePicker style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item name="email" label="Email to Send (optional)">
          <Input placeholder="user@example.com" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" onClick={generateStatement} loading={loading}>
            Generate Statement
          </Button>
          <Button
            icon={<FilePdfOutlined />}
            style={{ marginLeft: 10 }}
            onClick={exportPDF}
            disabled={!data.length}
          >
            Export as PDF
          </Button>
        </Form.Item>
      </Form>

      {data.length > 0 && (
        <Table
          columns={columns}
          dataSource={data}
          bordered
          title={() => "Statement Details"}
          pagination={false}
        />
      )}
    </Card>
  );
};

export default StatementsTab;
