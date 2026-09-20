import React, { useState, useEffect } from 'react';
import { Table, Card, Button, message, Modal, Form, InputNumber, Select, Space, Input, DatePicker } from 'antd';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;
const { RangePicker } = DatePicker;

const ReceivePayments = () => {
  const { symbol: cSym } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [invoicesPageSize, setInvoicesPageSize] = useState(20);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
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
  const [invoicesDateRange, setInvoicesDateRange] = useState(null);
  const [paymentsDateRange, setPaymentsDateRange] = useState(null);
  const [form] = Form.useForm();

  // Display name of the selected customer, for the empty state only.
  const selectedCustomerName = (() => {
    const c = customers.find(x => String(x.id) === String(selectedCustomerId));
    if (!c) return '';
    return c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || '';
  })();

  useEffect(() => {
    fetchCustomers();
    applyInvoiceFilters(1, 20, null, undefined);
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

  // The customer id is passed IN (not read from state) because a selection
  // handler runs before React re-renders — reading `selectedCustomerId` here
  // would query with the PREVIOUS value (undefined on the first pick), which is
  // exactly why the customer filter appeared to do nothing.
  const fetchInvoicesPaginated = async (page = 1, pageSize = 20, range = null, customerId = selectedCustomerId) => {
    setInvoicesLoading(true);
    try {
      const startFrom = range && range[0] ? range[0].format('YYYY-MM-DD') : '';
      const startTo = range && range[1] ? range[1].format('YYYY-MM-DD') : '';
      const res = await window.electronAPI.getInvoicesPaginated(page, pageSize, '', '!paid,cancelled,void', '', '', startFrom, startTo, customerId, true);
      const normalized = (res?.data || []).map(item => ({
        ...item,
        invoiceNumber: item.number || item.invoiceNumber || item.id,
        customerName: item.customer_name || item.customerName || '',
        date: item.start_date || item.last_date || item.date || null,
        total: Number(item.amount || item.total || 0),
        balance: Number(item.balance || item.amount || item.total || 0),
      }));
      setInvoices(normalized);
      setInvoicesTotal(res?.total || 0);
      setInvoicesPage(page);
      setInvoicesPageSize(pageSize);
    } catch (error) {
      message.error('Failed to load invoices');
      console.error('Error fetching invoices:', error);
    }
    setInvoicesLoading(false);
  };

  // Single entry point for the invoice list. Validates the range and forwards
  // the CURRENT customer id + dates explicitly, so filters always apply
  // together (AND) and Refresh never silently drops them.
  const applyInvoiceFilters = (page = 1, pageSize = invoicesPageSize, range = invoicesDateRange, customerId = selectedCustomerId) => {
    if (range && range[0] && range[1] && range[0].isAfter(range[1], 'day')) {
      message.error('Invoice From date cannot be after Invoice To date.');
      return Promise.resolve();
    }
    return fetchInvoicesPaginated(page, pageSize, range, customerId);
  };

  const fetchPaymentsPaginated = async (page = 1, pageSize = 20, search = '', range = null) => {
    setPaymentsLoading(true);
    try {
      const dateFrom = range && range[0] ? range[0].format('YYYY-MM-DD') : '';
      const dateTo = range && range[1] ? range[1].format('YYYY-MM-DD') : '';
      const res = await window.electronAPI.getPaymentsPaginated({ page, pageSize, search, dateFrom, dateTo });
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
    const invoiceAmount = Number(invoice.balance) || Number(invoice.total) || 0;
    form.setFieldsValue({
      amount: invoiceAmount,
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
        reference: values.reference || '',
        date: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : new Date().toISOString().slice(0,10)
      });
      message.success('Payment recorded successfully');
      setPaymentModal(false);
      // Refresh the SAME filtered list (customer + dates preserved).
      applyInvoiceFilters(invoicesPage, invoicesPageSize, invoicesDateRange, selectedCustomerId);
      fetchPaymentsPaginated(paymentsPage, paymentsPageSize, paymentSearch, paymentsDateRange);
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
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Select
            allowClear
            placeholder="Filter by customer"
            style={{ minWidth: 200 }}
            value={selectedCustomerId}
            onChange={(val) => {
              setSelectedCustomerId(val);
              // Pass the NEW id directly: React state is not updated yet in this
              // render, so relying on it here would query the previous customer.
              applyInvoiceFilters(1, invoicesPageSize, invoicesDateRange, val);
            }}
          >
            {customers.map(c => (
              <Select.Option key={c.id} value={c.id}>
                {c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name}
              </Select.Option>
            ))}
          </Select>
          <RangePicker
            placeholder={['Invoice from', 'Invoice to']}
            value={invoicesDateRange}
            onChange={(range) => {
              setInvoicesDateRange(range);
              applyInvoiceFilters(1, invoicesPageSize, range, selectedCustomerId);
            }}
            allowClear
            style={{ minWidth: 260 }}
          />
          <Button onClick={() => applyInvoiceFilters(1, invoicesPageSize)}>Refresh</Button>
        </Space>
        <Table
          columns={columns}
          dataSource={invoices}
          loading={invoicesLoading}
          rowKey="id"
          locale={{
            emptyText: selectedCustomerId
              ? `No outstanding invoices found${selectedCustomerName ? ` for ${selectedCustomerName}` : ''}.`
              : 'No outstanding invoices found.',
          }}
          pagination={{
            current: invoicesPage,
            pageSize: invoicesPageSize,
            total: invoicesTotal,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} unpaid invoices`,
            onChange: (p, size) => applyInvoiceFilters(p, size, invoicesDateRange, selectedCustomerId),
          }}
        />
      </Card>

      <Card title="Recent Payments" style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="Search payments..."
            allowClear
            style={{ width: 260 }}
            onSearch={(val) => { setPaymentSearch(val); fetchPaymentsPaginated(1, paymentsPageSize, val, paymentsDateRange); }}
          />
          <RangePicker
            placeholder={['Paid from', 'Paid to']}
            value={paymentsDateRange}
            onChange={(range) => {
              setPaymentsDateRange(range);
              fetchPaymentsPaginated(1, paymentsPageSize, paymentSearch, range);
            }}
            allowClear
            style={{ minWidth: 260 }}
          />
        </Space>
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
            onChange: (p, size) => fetchPaymentsPaginated(p, size, paymentSearch, paymentsDateRange),
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 16 }}>
            <Form.Item
              name="amount"
              label="Payment Amount"
              rules={[{ required: true, message: 'Please enter payment amount' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0.01}
                step={0.01}
                formatter={value => `${cSym} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value.replace(new RegExp(`\\${cSym}\\s?|(,*)`, 'g'), '')}
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
                <Option value="eft">EFT</Option>
              </Select>
            </Form.Item>

            <Form.Item name="reference" label="Reference Number">
              <Input placeholder="Check #, reference #, or transaction ID" />
            </Form.Item>
          </div>

          {selectedInvoice && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
              <div><strong>Invoice:</strong> {selectedInvoice.invoiceNumber || selectedInvoice.number || `INV-${selectedInvoice.id}`}</div>
              <div><strong>Total:</strong> {cSym} {Number(selectedInvoice.total || 0).toFixed(2)}</div>
              <div><strong>Balance Due:</strong> {cSym} {Number(selectedInvoice.balance || 0).toFixed(2)}</div>
            </div>
          )}
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
