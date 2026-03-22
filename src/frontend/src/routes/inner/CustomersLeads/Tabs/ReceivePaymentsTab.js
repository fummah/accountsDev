import React, { useState, useEffect } from "react";
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
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const onCustomerChange = async (customerId) => {
    try {
      setLoading(true);
      const response = await window.electronAPI.getUnpaidInvoices(customerId);
      const customer = customers.find(c => c.id === customerId);
      setSelectedCustomer(customer);
      setInvoices(response || []);
      form.setFieldsValue({ invoiceId: undefined, amount: undefined });
    } catch (error) {
      message.error('Failed to load customer invoices');
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const paymentData = {
        customerId: values.customerId,
        invoiceId: values.invoiceId,
        amount: values.amount,
        paymentDate: values.paymentDate.format('YYYY-MM-DD'),
        paymentMethod: values.paymentMethod,
        notes: values.notes,
        entered_by: "1" // TODO: Get from current user context
      };

      const response = await window.electronAPI.recordPayment(paymentData);
      
      if (response.success) {
        message.success("Payment recorded successfully");
        form.resetFields();
        setInvoices([]);
        setSelectedCustomer(null);
        // Refresh the invoices list
        if (values.customerId) {
          onCustomerChange(values.customerId);
        }
      } else {
        throw new Error(response.error || 'Failed to record payment');
      }
    } catch (error) {
      message.error(error.message || 'Failed to record payment');
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
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
          <Select 
            placeholder="Select customer" 
            onChange={onCustomerChange}
            loading={loading}
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {customers.map((c) => (
              <Option key={c.id} value={c.id}>
                {c.company_name || `${c.first_name} ${c.last_name}`}
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
