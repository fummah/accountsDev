import React, { useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  DatePicker,
  Select,
  InputNumber,
  Table,
  message,
} from "antd";
import { DollarOutlined } from "@ant-design/icons";

const { Option } = Select;

const dummyCustomers = [
  { id: 1, name: "John Doe", invoices: [{ id: "INV001", amountDue: 150 }] },
  { id: 2, name: "Jane Smith", invoices: [{ id: "INV002", amountDue: 300 }] },
];

const ReceivePaymentsTab = () => {
  const [form] = Form.useForm();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const onCustomerChange = (customerId) => {
    const customer = dummyCustomers.find((c) => c.id === customerId);
    setSelectedCustomer(customer);
    setInvoices(customer?.invoices || []);
    form.setFieldsValue({ invoiceId: undefined, amount: undefined });
  };

  const onFinish = (values) => {
    console.log("Received Payment:", values);
    message.success("Payment recorded successfully.");
    form.resetFields();
    setInvoices([]);
    setSelectedCustomer(null);
  };

  const invoiceOptions = invoices.map((inv) => (
    <Option key={inv.id} value={inv.id}>
      {inv.id} - Amount Due: ${inv.amountDue}
    </Option>
  ));

  return (
    <Card
      title={
        <span>
          <DollarOutlined /> Receive Payment
        </span>
      }
      style={{ maxWidth: 700, margin: "0 auto", marginTop: 30 }}
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="customerId"
          label="Customer"
          rules={[{ required: true, message: "Please select a customer" }]}
        >
          <Select placeholder="Select customer" onChange={onCustomerChange}>
            {dummyCustomers.map((c) => (
              <Option key={c.id} value={c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="invoiceId"
          label="Invoice"
          rules={[{ required: true, message: "Please select an invoice" }]}
        >
          <Select placeholder="Select invoice" disabled={!invoices.length}>
            {invoiceOptions}
          </Select>
        </Form.Item>

        <Form.Item
          name="paymentDate"
          label="Payment Date"
          rules={[{ required: true, message: "Please select the date" }]}
        >
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          name="paymentMethod"
          label="Payment Method"
          rules={[{ required: true, message: "Please select payment method" }]}
        >
          <Select placeholder="Select payment method">
            <Option value="Cash">Cash</Option>
            <Option value="Credit Card">Credit Card</Option>
            <Option value="Bank Transfer">Bank Transfer</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="amount"
          label="Amount Received"
          rules={[{ required: true, message: "Please enter amount" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            min={1}
            formatter={(value) =>
              `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            }
            parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
          />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Record Payment
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ReceivePaymentsTab;
