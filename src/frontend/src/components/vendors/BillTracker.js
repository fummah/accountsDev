import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Form, DatePicker, Select, Modal, message, Card, Statistic, Tag, Space, Row, Col, Typography, InputNumber, Divider, Menu } from 'antd';
import { FileTextOutlined, DollarOutlined, ExclamationCircleOutlined, SwapOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory, useLocation } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';

import AccountSelect from '../shared/AccountSelect';

const { Option } = Select;
const { Text } = Typography;

const statusColor = (s) => {
  const v = (s || '').toLowerCase();
  if (v === 'paid') return 'green';
  if (v === 'overdue') return 'red';
  if (v === 'unpaid') return 'orange';
  if (v === 'partially paid') return 'blue';
  if (v === 'draft') return 'default';
  return 'default';
};

const BillTracker = () => {
  const { symbol: cSym } = useCurrency();
  const location = useLocation();
  const [bills, setBills] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [payingBill, setPayingBill] = useState(null);
  const [payForm] = Form.useForm();
  const [paying, setPaying] = useState(false);
  const [printOptionVisible, setPrintOptionVisible] = useState(false);
  const [createdCheck, setCreatedCheck] = useState(null);
  const [filters, setFilters] = useState({ status: '', vendor: '', dueDateRange: [] });
  const [deleteModal, setDeleteModal] = useState(false);
  const [deletingBill, setDeletingBill] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const history = useHistory();

  useEffect(() => {
    loadBills();
    loadBankAccounts();
  }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllExpenses();
      const list = Array.isArray(data) ? data : (data?.data || []);
      const today = moment();
      const mapped = list
        .filter(b => ['bill', 'supplier'].includes((b.category || '').toLowerCase()))
        .map(b => {
          const dueDate = b.due_date || b.payment_date;
          const statusRaw = (b.approval_status || 'Unpaid');
          const isPaid = statusRaw.toLowerCase() === 'paid';
          const isDraft = statusRaw.toLowerCase() === 'draft';
          const isOverdue = !isPaid && !isDraft && dueDate && moment(dueDate).isBefore(today, 'day');
          const paidAmt = Number(b.paid_amount) || 0;
          const totalAmt = Number(b.amount) || 0;
          return {
            id: b.id,
            billDate: b.payment_date,
            dueDate,
            vendorName: b.payee_name || String(b.payee || ''),
            vendorId: b.payee,
            billNumber: b.ref_no || `#${b.id}`,
            amount: totalAmt,
            paidAmount: paidAmt,
            remaining: totalAmt - paidAmt,
            status: isPaid ? 'Paid' : isDraft ? 'Draft' : isOverdue ? 'Overdue' : statusRaw,
            memo: b.memo || '',
          };
        });
      setBills(mapped);
    } catch (error) {
      console.error('Failed to load bills', error);
      message.error('Failed to load bills');
    } finally { setLoading(false); }
  };

  const loadBankAccounts = async () => {
    try {
      const accs = await window.electronAPI.getChartOfAccounts?.();
      const list = Array.isArray(accs) ? accs : [];
      setAllAccounts(list);
      setBankAccounts(list.filter(a => ['Bank', 'Cash', 'bank', 'cash'].includes(a.accountType || a.type || '')));
    } catch {}
  };

  const openPayModal = (record) => {
    setPayingBill(record);
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.id != null ? Number(bankAccounts[0].id) : (bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined),
    });
    setPayModal(true);
  };

  const handlePayBill = async (values) => {
    if (!payingBill) return;
    try {
      setPaying(true);
      const paymentDate = values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const bankName = values.bankAccount;
      const bankAccount = bankAccounts.find(a => String(a.id) === String(bankName))
        || bankAccounts.find(a => (a.accountName || a.name) === bankName);
      const bill = payingBill;
      const amt = bill.remaining > 0 ? bill.remaining : bill.amount;
      if (amt <= 0) { message.warning('Bill amount is zero'); return; }

      const stats = await window.electronAPI.getCheckStats?.().catch(() => null);
      const nextNum = stats?.nextCheckNumber ? parseInt(stats.nextCheckNumber, 10) : 1001;

      const checkTx = {
        date: paymentDate,
        type: 'Check',
        amount: amt,
        description: `Payment for bill ${bill.billNumber} - ${bill.vendorName}`,
        reference: String(nextNum),
        accountId: bankAccount ? Number(bankAccount.id) : undefined,
        payee_name: bill.vendorName || '',
        entered_by: 'system',
        splitLines: [{ account: 'Accounts Payable', description: `Bill payment ${bill.billNumber}`, amount: amt }],
      };
      const checkRes = await window.electronAPI.insertTransaction(checkTx);
      if (!checkRes || (!checkRes.changes && !checkRes.success)) {
        throw new Error(`Failed to create check for bill ${bill.billNumber}`);
      }
      const checkId = checkRes.lastInsertRowid || checkRes.id;

      const payRes = await window.electronAPI.markExpensePaid(bill.id);
      if (!payRes?.success) {
        throw new Error(payRes?.error || `Failed to mark bill ${bill.billNumber} as paid`);
      }

      setCreatedCheck({ checkId, billId: bill.id, billRef: bill.billNumber, amount: amt, payee: bill.vendorName, bankName, paymentDate });
      setPayModal(false);
      payForm.resetFields();
      setPayingBill(null);
      await loadBills();
      setPrintOptionVisible(true);
    } catch (err) {
      message.error(err.message || 'Failed to process payment');
    } finally { setPaying(false); }
  };

  const handlePrintNow = () => {
    setPrintOptionVisible(false);
    message.success('Opening check for printing...');
    history.push(`/main/accountant/check-printing?checkId=${createdCheck?.checkId || ''}`);
  };

  const handlePrintLater = () => {
    setPrintOptionVisible(false);
    message.success('Check saved. Print later from Check Printing screen.');
  };

  const openDeleteModal = (record) => {
    setDeletingBill(record);
    setDeleteModal(true);
  };

  const handleDeleteBill = async () => {
    if (!deletingBill) return;
    try {
      setDeleting(true);
      const result = await window.electronAPI.deleteRecord(deletingBill.id, 'expenses');
      if (result?.success) {
        message.success(`Bill ${deletingBill.billNumber} deleted successfully.`);
        setDeleteModal(false);
        setDeletingBill(null);
        await loadBills();
      } else {
        message.error(result?.error || 'Failed to delete bill. Please try again.');
      }
    } catch (error) {
      console.error('Failed to delete bill', error);
      message.error('An error occurred while deleting the bill.');
    } finally { setDeleting(false); }
  };

  const uniqueVendors = useMemo(() => [...new Set(bills.map(b => b.vendorName).filter(Boolean))], [bills]);

  const filteredBills = useMemo(() => {
    let list = bills;
    if (filters.status) {
      list = list.filter(b => b.status.toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.vendor) {
      list = list.filter(b => b.vendorName.toLowerCase().includes(filters.vendor.toLowerCase()));
    }
    const [start, end] = filters.dueDateRange;
    if (start && end) {
      list = list.filter(b => {
        if (!b.dueDate) return false;
        const d = moment(b.dueDate);
        return d.isBetween(start.startOf('day'), end.endOf('day'), null, '[]');
      });
    }
    return list;
  }, [bills, filters]);

  const summary = useMemo(() => {
    const today = moment();
    const startOfMonth = moment().startOf('month');
    const unpaid = filteredBills.filter(b => b.status.toLowerCase() !== 'paid' && b.status.toLowerCase() !== 'draft');
    const paidThisMonth = bills.filter(b => b.status.toLowerCase() === 'paid' && b.billDate && moment(b.billDate).isSameOrAfter(startOfMonth, 'day'));
    return {
      totalUnpaid: unpaid.reduce((s, b) => s + b.remaining, 0),
      overdue: filteredBills.filter(b => b.status.toLowerCase() === 'overdue').length,
      dueThisWeek: unpaid.filter(b => b.dueDate && moment(b.dueDate).isBetween(today, moment().add(7, 'days'), 'day', '[]')).length,
      paidThisMonth: paidThisMonth.reduce((s, b) => s + b.amount, 0),
    };
  }, [bills, filteredBills]);

  const columns = [
    { title: 'Bill #', dataIndex: 'billNumber', key: 'billNumber', width: 110,
      sorter: (a, b) => (a.billNumber || '').localeCompare(b.billNumber || '') },
    { title: 'Vendor', dataIndex: 'vendorName', key: 'vendorName',
      sorter: (a, b) => (a.vendorName || '').localeCompare(b.vendorName || '') },
    { title: 'Bill Date', dataIndex: 'billDate', key: 'billDate', width: 110,
      sorter: (a, b) => new Date(a.billDate || 0) - new Date(b.billDate || 0),
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 110,
      sorter: (a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0),
      render: (d, r) => {
        if (!d) return '-';
        const isOver = r.status.toLowerCase() === 'overdue';
        return <span style={{ color: isOver ? '#ff4d4f' : undefined }}>{moment(d).format('MM/DD/YYYY')}</span>;
      }
    },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 110, align: 'right',
      sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: a => `${cSym} ${Number(a || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { title: 'Paid', dataIndex: 'paidAmount', key: 'paidAmount', width: 100, align: 'right',
      sorter: (a, b) => Number(a.paidAmount || 0) - Number(b.paidAmount || 0),
      render: (v, r) => Number(v) > 0 ? `${cSym} ${Number(v).toFixed(2)}` : '-' },
    { title: 'Remaining', dataIndex: 'remaining', key: 'remaining', width: 110, align: 'right',
      sorter: (a, b) => Number(a.remaining || 0) - Number(b.remaining || 0),
      render: (v, r) => {
        if (r.status.toLowerCase() === 'paid') return <Text type="secondary">—</Text>;
        return <Text strong={v > 0}>{cSym} {Math.max(0, v).toFixed(2)}</Text>;
      }
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
      render: s => <Tag color={statusColor(s)}>{(s || '').toUpperCase()}</Tag> },
    { title: 'Actions', key: 'actions', width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />}
            onClick={() => history.push(`/main/vendors/bills/edit/${record.id}`)}>
            {record.status.toLowerCase() === 'draft' ? 'Edit' : 'View'}
          </Button>
          <Button size="small" type="primary" icon={<DollarOutlined />}
            disabled={record.status.toLowerCase() === 'paid' || record.status.toLowerCase() === 'draft'}
            onClick={() => openPayModal(record)}>
            Pay
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />}
            onClick={() => openDeleteModal(record)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Menu
        mode="horizontal"
        selectedKeys={[location.pathname]}
        onClick={({ key }) => { if (key !== location.pathname) history.push(key); }}
        style={{ marginBottom: 16 }}
      >
        <Menu.Item key="/main/vendors/bills/tracker">Bill Management</Menu.Item>
        <Menu.Item key="/main/vendors/bills/enter">Enter Bill</Menu.Item>
        <Menu.Item key="/main/vendors/bills/pay">Pay Bill</Menu.Item>
      </Menu>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Bill Management</h2>
        <Space>
          <Button icon={<SwapOutlined />}
            onClick={() => history.push('/main/vendors/credits')}>
            Vendor Credits
          </Button>
        </Space>
      </div>

      {/* Summary KPIs */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #faad14' }}>
            <Statistic title="Total Outstanding" value={summary.totalUnpaid} precision={2} prefix={cSym}
              valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Overdue Bills" value={summary.overdue} suffix="bills"
              valueStyle={{ color: '#ff4d4f' }}
              prefix={summary.overdue > 0 ? <ExclamationCircleOutlined /> : null} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Due This Week" value={summary.dueThisWeek} suffix="bills"
              valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Paid This Month" value={summary.paidThisMonth} precision={2} prefix={cSym}
              valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select allowClear placeholder="Status" style={{ width: 140 }} value={filters.status || undefined}
          onChange={v => setFilters(f => ({ ...f, status: v || '' }))}>
          <Option value="unpaid">Unpaid</Option>
          <Option value="paid">Paid</Option>
          <Option value="overdue">Overdue</Option>
          <Option value="partially paid">Partially Paid</Option>
          <Option value="draft">Draft</Option>
        </Select>
        <Select showSearch allowClear placeholder="Vendor" style={{ width: 200 }} value={filters.vendor || undefined}
          onChange={v => setFilters(f => ({ ...f, vendor: v || '' }))}>
          {uniqueVendors.map(v => <Option key={v} value={v}>{v}</Option>)}
        </Select>
        <DatePicker.RangePicker value={filters.dueDateRange}
          onChange={range => setFilters(f => ({ ...f, dueDateRange: range || [] }))}
          format="MM/DD/YYYY" placeholder={['Due start', 'Due end']} />
        <Button size="small" onClick={() => setFilters({ status: '', vendor: '', dueDateRange: [] })}>Clear</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={filteredBills}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: t => `${t} bills` }}
        rowClassName={r => r.status.toLowerCase() === 'overdue' ? 'ant-table-row-error' : ''}
      />

      {/* Pay Bill Modal */}
      <Modal
        title={<span><DollarOutlined style={{ marginRight: 8 }} />Pay Bill — Creates Check</span>}
        visible={payModal}
        onOk={() => payForm.submit()}
        onCancel={() => { setPayModal(false); payForm.resetFields(); setPayingBill(null); }}
        confirmLoading={paying}
        okText="Record Payment & Print Check"
        destroyOnClose
        width={500}
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayBill} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Total to Pay">
                <Text strong style={{ fontSize: 16 }}>{cSym} {Number(payingBill?.remaining > 0 ? payingBill.remaining : payingBill?.amount || 0).toFixed(2)}</Text>
                <div><Text type="secondary">1 bill</Text></div>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="bankAccount" label="Bank Account (Check will be drawn from this)" rules={[{ required: true, message: 'Select bank account' }]}>
            <AccountSelect accounts={bankAccounts} placeholder="Select bank account" />
          </Form.Item>

          <Divider />
          <div style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
            <Text strong>What will happen:</Text>
            <div style={{ marginTop: 4, color: '#555' }}>
              1. A check transaction will be created<br />
              2. The check will be posted to the register of the selected bank account<br />
              3. Accounting entry: DR Accounts Payable / CR {(() => { const b = payForm.getFieldValue('bankAccount'); const acc = bankAccounts.find(a => String(a.id) === String(b)) || bankAccounts.find(a => (a.accountName || a.name) === b); return (acc && (acc.accountName || acc.name)) || 'Bank'; })()}<br />
              4. The bill will be marked as Paid<br />
              5. You can print the check from the Check Printing screen
            </div>
          </div>
        </Form>
      </Modal>

      {/* Print Check Modal */}
      <Modal
        title="Print Check?"
        visible={printOptionVisible}
        onCancel={handlePrintLater}
        footer={[
          <Button key="later" onClick={handlePrintLater}>Print Later</Button>,
          <Button key="now" type="primary" onClick={handlePrintNow}>Print Now</Button>,
        ]}
        width={400}
        destroyOnClose
      >
        <Text>Check created. Do you want to print it now?</Text>
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Print Now: Opens check print preview immediately<br />
          Print Later: Saves check without printing. Print from Check Printing screen later.
        </div>
      </Modal>

      {/* Delete Bill Confirmation Modal */}
      <Modal
        title={<span><DeleteOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />Delete Bill</span>}
        visible={deleteModal}
        onOk={handleDeleteBill}
        onCancel={() => { setDeleteModal(false); setDeletingBill(null); }}
        confirmLoading={deleting}
        okText="Delete"
        okButtonProps={{ danger: true }}
        width={420}
        destroyOnClose
      >
        <Text>
          Are you sure you want to delete bill <Text strong>{deletingBill?.billNumber}</Text> from <Text strong>{deletingBill?.vendorName}</Text>?
        </Text>
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          This will permanently remove the bill and its related records. This action cannot be undone.
        </div>
      </Modal>
    </div>
  );
};

export default BillTracker;