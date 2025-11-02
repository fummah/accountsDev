import React, { useState } from "react";
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

  const generateStatement = () => {
    form
      .validateFields()
      .then((values) => {
        setLoading(true);

        // Simulate API call
        setTimeout(() => {
          setData(mockData);
          setLoading(false);
          message.success("Statement generated successfully");
        }, 1000);
      })
      .catch(() => {
        message.error("Please fill in all required fields.");
      });
  };

  const exportPDF = () => {
    message.info("Export to PDF not implemented yet.");
  };

  return (
    <Card title="Generate Statement" bordered>
      <Form layout="vertical" form={form}>
        <Form.Item
          name="customer"
          label="Customer"
          rules={[{ required: true, message: "Please select a customer" }]}
        >
          <Select placeholder="Select customer">
            <Option value="john">John Doe</Option>
            <Option value="jane">Jane Smith</Option>
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
