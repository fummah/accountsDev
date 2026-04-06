import React, { useState, useEffect } from 'react';
import { Table, Card, Button, message, Modal, Form, InputNumber, Select, Space, Input } from 'antd';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;

const ReceivePayments = () => {
  const { symbol: cSym } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState();
  const [payments, setPayments] = useState([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(20);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [form] = Form.useForm();
  const history = useHistory();

  useEffect(() => {
    fetchCustomers();
    fetchInvoices();
    fetchPaymentsPaginated(1, 20, '');
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await window.electronAPI.getAllCustomers();
      setCustomers(res?.all || []);
    } catch (error) {
      message.error('Failed to load customers');
      console.error('Error fetching customers:', error);
    }
  };

  const fetchInvoices = async (customerId) => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getUnpaidInvoices(customerId);
      // Normalize invoice fields for the table. Backend returns invoice rows
      // but may not include a pre-computed total. Ensure numeric fields exist.
      const normalized = (data || []).map(item => ({
        ...item,
        invoiceNumber: item.number || item.invoiceNumber || item.id,
        date: item.start_date || item.last_date || item.date || null,
        total: Number(item.total || item.amount || item.amount_due || 0),
        balance: Number(item.balance || item.remaining || 0),
      }));
      setInvoices(normalized);
    } catch (error) {
      message.error('Failed to load invoices');
      console.error('Error fetching invoices:', error);
    }
    setLoading(false);
  };

  const fetchPaymentsPaginated = async (page = 1, pageSize = 20, search = '') => {
    setPaymentsLoading(true);
    try {
      const res = await window.electronAPI.getPaymentsPaginated({ page, pageSize, search });
      const data = (res?.data || []).map(p => ({
        key: p.id || `${p.invoiceNumber || 'INV'}-${p.date || p.createdAt || Math.random()}`,
        id: p.id,
        date: p.date || p.createdAt,
        amount: Number(p.amount || 0),
        paymentMethod: p.paymentMethod,
        customerName: p.customerName,
        invoiceNumber: p.invoiceNumber,
      }));
      setPayments(data);
      setPaymentsTotal(res?.total || 0);
      setPaymentsPage(page);
      setPaymentsPageSize(pageSize);
    } catch (error) {
      console.error('Error fetching payments history:', error);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handlePayment = (invoice) => {
    setSelectedInvoice(invoice);
    form.setFieldsValue({
      amount: invoice.balance,
      paymentMethod: 'bank'
    });
    setPaymentModal(true);
  };

  const onFinishPayment = async (values) => {
    try {
      await window.electronAPI.recordPayment({
        invoiceId: selectedInvoice.id,
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        date: new Date().toISOString()
      });
      message.success('Payment recorded successfully');
      setPaymentModal(false);
      fetchInvoices(selectedCustomerId);
      fetchPaymentsPaginated(paymentsPage, paymentsPageSize, paymentSearch);
    } catch (error) {
      message.error('Failed to record payment');
      console.error('Error recording payment:', error);
    }
  };

  const columns = [
    {
      title: 'Invoice #',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (amount) => `${cSym} ${Number(amount || 0).toFixed(2)}`,
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (amount) => `${cSym} ${Number(amount || 0).toFixed(2)}`,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button type="primary" onClick={() => handlePayment(record)}>
          Receive Payment
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card title="Receive Payments">
        <Space style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="Filter by customer"
            style={{ minWidth: 240 }}
            value={selectedCustomerId}
            onChange={(val) => {
              setSelectedCustomerId(val);
              fetchInvoices(val);
            }}
          >
            {customers.map(c => (
              <Select.Option key={c.id} value={c.id}>
                {c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name}
              </Select.Option>
            ))}
          </Select>
          <Button onClick={() => fetchInvoices(selectedCustomerId)}>Refresh</Button>
        </Space>
        <Table
          columns={columns}
          dataSource={invoices}
          loading={loading}
          rowKey="id"
        />
      </Card>

      <Card title="Recent Payments" style={{ marginTop: 16 }}>
        <Input.Search
          placeholder="Search payments..."
          allowClear
          style={{ width: 300, marginBottom: 12 }}
          onSearch={(val) => { setPaymentSearch(val); fetchPaymentsPaginated(1, paymentsPageSize, val); }}
        />
        <Table
          columns={[
            { title: 'Date', dataIndex: 'date', key: 'date', render: (d) => (d ? new Date(d).toLocaleString() : '-') },
            { title: 'Customer', dataIndex: 'customerName', key: 'customerName' },
            { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
            { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (a) => `${cSym} ${Number(a || 0).toFixed(2)}` },
            { title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod' },
          ]}
          dataSource={payments}
          rowKey={(row) => row.id || row.key}
          loading={paymentsLoading}
          pagination={{
            current: paymentsPage,
            pageSize: paymentsPageSize,
            total: paymentsTotal,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} payments`,
            onChange: (p, size) => fetchPaymentsPaginated(p, size, paymentSearch),
          }}
        />
      </Card>

      <Modal
        title="Receive Payment"
        visible={paymentModal}
        onCancel={() => setPaymentModal(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinishPayment}
        >
          <Form.Item
            name="amount"
            label="Payment Amount"
            rules={[{ required: true, message: 'Please enter payment amount' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item
            name="paymentMethod"
            label="Payment Method"
            rules={[{ required: true, message: 'Please select payment method' }]}
          >
            <Select>
              <Option value="bank">Bank Transfer</Option>
              <Option value="cash">Cash</Option>
              <Option value="check">Check</Option>
              <Option value="card">Credit Card</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Confirm Payment
              </Button>
              <Button onClick={() => setPaymentModal(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ReceivePayments;
