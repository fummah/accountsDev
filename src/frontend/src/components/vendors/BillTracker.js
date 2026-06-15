import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Form, DatePicker, Select, Modal, message, Card, Statistic, Tag, Space, Row, Col, Typography } from 'antd';
import { PlusOutlined, FileTextOutlined, DollarOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Text } = Typography;

const statusColor = (s) => {
  const v = (s || '').toLowerCase();
  if (v === 'paid') return 'green';
  if (v === 'overdue') return 'red';
  if (v === 'unpaid') return 'orange';
  return 'default';
};

const BillTracker = () => {
  const { symbol: cSym } = useCurrency();
  const [bills, setBills] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [payingBill, setPayingBill] = useState(null);
  const [payForm] = Form.useForm();
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
          const isOverdue = !isPaid && dueDate && moment(dueDate).isBefore(today, 'day');
          return {
            id: b.id,
            billDate: b.payment_date,
            dueDate,
            vendorName: b.payee_name || String(b.payee || ''),
            billNumber: b.ref_no || `#${b.id}`,
            amount: Number(b.amount) || 0,
            status: isPaid ? 'Paid' : isOverdue ? 'Overdue' : statusRaw,
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
      setBankAccounts(list.filter(a => ['Bank', 'Cash', 'bank', 'cash'].includes(a.accountType || a.type || '')));
    } catch {}
  };

  const openPayModal = (record) => {
    setPayingBill(record);
    payForm.setFieldsValue({ paymentDate: moment(), bankAccount: bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined });
    setPayModal(true);
  };

  const handlePayBill = async (values) => {
    if (!payingBill) return;
    try {
      setLoading(true);
      const res = await window.electronAPI.billPay({
        expenseId: payingBill.id,
        amount: payingBill.amount,
        paymentDate: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        bankAccount: values.bankAccount,
      });
      if (res && res.success) {
        message.success(`Bill ${payingBill.billNumber} paid — DR Accounts Payable / CR ${values.bankAccount || 'Bank'}`);
        setPayModal(false);
        payForm.resetFields();
        setPayingBill(null);
        await loadBills();
      } else {
        message.error(res?.error || 'Failed to pay bill');
      }
    } catch (err) {
      message.error('Failed to pay bill');
    } finally { setLoading(false); }
  };

  const summary = useMemo(() => {
    const today = moment();
    const unpaid = bills.filter(b => b.status.toLowerCase() !== 'paid');
    return {
      totalUnpaid: unpaid.reduce((s, b) => s + b.amount, 0),
      overdue: bills.filter(b => b.status.toLowerCase() === 'overdue').length,
      dueThisWeek: unpaid.filter(b => b.dueDate && moment(b.dueDate).isBetween(today, moment().add(7, 'days'), 'day', '[]')).length,
    };
  }, [bills]);

  const columns = [
    { title: 'Bill #', dataIndex: 'billNumber', key: 'billNumber', width: 110 },
    { title: 'Vendor', dataIndex: 'vendorName', key: 'vendorName' },
    { title: 'Bill Date', dataIndex: 'billDate', key: 'billDate', width: 110,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 110,
      render: (d, r) => {
        if (!d) return '-';
        const isOver = r.status.toLowerCase() === 'overdue';
        return <span style={{ color: isOver ? '#ff4d4f' : undefined }}>{moment(d).format('MM/DD/YYYY')}</span>;
      }
    },
    { title: 'Memo', dataIndex: 'memo', key: 'memo', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: a => `${cSym} ${Number(a || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: s => <Tag color={statusColor(s)}>{(s || '').toUpperCase()}</Tag> },
    { title: 'Actions', key: 'actions', width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />}
            onClick={() => history.push(`/main/vendors/bills/edit/${record.id}`)}>
            View
          </Button>
          <Button size="small" type="primary" icon={<DollarOutlined />}
            disabled={record.status.toLowerCase() === 'paid'}
            onClick={() => openPayModal(record)}>
            Pay
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Bill Tracker</h2>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => history.push('/main/vendors/bills/enter')}>
          Enter Bill
        </Button>
      </div>

      {/* Summary KPIs */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderTop: '3px solid #faad14' }}>
            <Statistic title="Total Unpaid" value={summary.totalUnpaid} precision={2} prefix={cSym}
              valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Overdue Bills" value={summary.overdue} suffix="bills"
              valueStyle={{ color: '#ff4d4f' }}
              prefix={summary.overdue > 0 ? <ExclamationCircleOutlined /> : null} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Due This Week" value={summary.dueThisWeek} suffix="bills"
              valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={bills}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} bills` }}
        rowClassName={r => r.status.toLowerCase() === 'overdue' ? 'ant-table-row-error' : ''}
      />

      {/* Pay Bill Modal */}
      <Modal
        title={`Pay Bill — ${payingBill?.billNumber} (${cSym} ${Number(payingBill?.amount || 0).toFixed(2)})`}
        visible={payModal}
        onOk={() => payForm.submit()}
        onCancel={() => { setPayModal(false); payForm.resetFields(); setPayingBill(null); }}
        confirmLoading={loading}
        okText="Record Payment"
        destroyOnClose
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayBill} preserve={false}>
          <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]}
            initialValue={moment()}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="bankAccount" label="Pay From (Bank Account)" rules={[{ required: true, message: 'Select a bank account' }]}>
            <Select placeholder="Select bank account" showSearch optionFilterProp="children">
              {bankAccounts.map(a => (
                <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12, color: '#555' }}>
            <strong>Accounting:</strong> DR Accounts Payable {cSym} {Number(payingBill?.amount || 0).toFixed(2)} &nbsp;/&nbsp;
            CR Bank Account {cSym} {Number(payingBill?.amount || 0).toFixed(2)}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default BillTracker;