import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Form, DatePicker, Select, Modal, message, Card, Statistic, Tag, Space, Row, Col, Typography, InputNumber } from 'antd';
import { PlusOutlined, FileTextOutlined, DollarOutlined, ExclamationCircleOutlined, SwapOutlined, PrinterOutlined } from '@ant-design/icons';
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
  if (v === 'partially paid') return 'blue';
  if (v === 'draft') return 'default';
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
  const [availableCredits, setAvailableCredits] = useState([]);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [payAmount, setPayAmount] = useState(0);
  const [filters, setFilters] = useState({ status: '', vendor: '', dueDateRange: [] });
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
      setBankAccounts(list.filter(a => ['Bank', 'Cash', 'bank', 'cash'].includes(a.accountType || a.type || '')));
    } catch {}
  };

  const openPayModal = async (record) => {
    setPayingBill(record);
    const remaining = record.remaining > 0 ? record.remaining : record.amount;
    setPayAmount(remaining);
    setSelectedCredit(null);
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined,
      amount: remaining,
    });
    // Load available vendor credits for this vendor
    try {
      const credits = await window.electronAPI.vendorCreditsAvailable(record.vendorId);
      setAvailableCredits(Array.isArray(credits) ? credits : []);
    } catch { setAvailableCredits([]); }
    setPayModal(true);
  };

  const handlePayBill = async (values) => {
    if (!payingBill) return;
    try {
      setLoading(true);
      let creditAmt = 0;

      // Apply credit if selected
      if (selectedCredit) {
        creditAmt = Math.min(selectedCredit.remaining_amount, payAmount);
        const creditRes = await window.electronAPI.vendorCreditsApply(
          selectedCredit.id, payingBill.id, creditAmt
        );
        if (!creditRes?.success) {
          message.warning(creditRes?.error || 'Failed to apply credit');
        }
      }

      // Cash payment = total pay amount minus what the credit covered
      const cashAmount = payAmount - creditAmt;
      if (cashAmount > 0.005) {
        const res = await window.electronAPI.billPay({
          expenseId: payingBill.id,
          amount: cashAmount,
          paymentDate: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
          bankAccount: values.bankAccount,
        });
        if (res && res.success) {
          message.success(`Payment recorded — ${payingBill.billNumber}`);
          // Offer to print check
          if (res.check) {
            Modal.confirm({
              title: 'Print Check?',
              icon: <PrinterOutlined />,
              content: `Check #${res.check.checkNumber} for ${cSym}${Number(res.check.amount).toFixed(2)} to ${res.check.payee}. Would you like to print this check?`,
              okText: 'Print',
              cancelText: 'Skip',
              onOk: () => { history.push('/main/accountant/check-printing'); },
            });
          }
        } else {
          message.error(res?.error || 'Failed to pay bill');
          return;
        }
      }

      setPayModal(false);
      payForm.resetFields();
      setPayingBill(null);
      setSelectedCredit(null);
      await loadBills();
    } catch (err) {
      message.error('Failed to process payment');
    } finally { setLoading(false); }
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
    const unpaid = filteredBills.filter(b => b.status.toLowerCase() !== 'paid' && b.status.toLowerCase() !== 'draft');
    return {
      totalUnpaid: unpaid.reduce((s, b) => s + b.remaining, 0),
      overdue: filteredBills.filter(b => b.status.toLowerCase() === 'overdue').length,
      dueThisWeek: unpaid.filter(b => b.dueDate && moment(b.dueDate).isBetween(today, moment().add(7, 'days'), 'day', '[]')).length,
    };
  }, [filteredBills]);

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
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 110, align: 'right',
      render: a => `${cSym} ${Number(a || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { title: 'Paid', dataIndex: 'paidAmount', key: 'paidAmount', width: 100, align: 'right',
      render: (v, r) => Number(v) > 0 ? `${cSym} ${Number(v).toFixed(2)}` : '-' },
    { title: 'Remaining', dataIndex: 'remaining', key: 'remaining', width: 110, align: 'right',
      render: (v, r) => {
        if (r.status.toLowerCase() === 'paid') return <Text type="secondary">—</Text>;
        return <Text strong={v > 0}>{cSym} {Math.max(0, v).toFixed(2)}</Text>;
      }
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120,
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
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Bill Tracker</h2>
        <Space>
          <Button icon={<SwapOutlined />}
            onClick={() => history.push('/main/vendors/credits')}>
            Vendor Credits
          </Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => history.push('/main/vendors/bills/enter')}>
            Enter Bill
          </Button>
        </Space>
      </div>

      {/* Summary KPIs */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderTop: '3px solid #faad14' }}>
            <Statistic title="Total Outstanding" value={summary.totalUnpaid} precision={2} prefix={cSym}
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
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} bills` }}
        rowClassName={r => r.status.toLowerCase() === 'overdue' ? 'ant-table-row-error' : ''}
      />

      {/* Pay Bill Modal */}
      <Modal
        title={`Pay Bill — ${payingBill?.billNumber}`}
        visible={payModal}
        onOk={() => payForm.submit()}
        onCancel={() => { setPayModal(false); payForm.resetFields(); setPayingBill(null); setSelectedCredit(null); }}
        confirmLoading={loading}
        okText="Record Payment"
        destroyOnClose
        width={520}
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayBill} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]}
                initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bill Total">
                <Text strong style={{ fontSize: 16 }}>{cSym} {Number(payingBill?.amount || 0).toFixed(2)}</Text>
                {Number(payingBill?.paidAmount || 0) > 0 && (
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Already paid: {cSym} {Number(payingBill?.paidAmount || 0).toFixed(2)}</Text></div>
                )}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Payment Amount" required>
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              step={0.01}
              prefix={cSym}
              value={payAmount}
              onChange={v => setPayAmount(Number(v) || 0)}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v.replace(/,/g, '')}
            />
          </Form.Item>

          <Form.Item name="bankAccount" label="Pay From (Bank Account)" rules={[{ required: true, message: 'Select a bank account' }]}>
            <Select placeholder="Select bank account" showSearch optionFilterProp="children">
              {bankAccounts.map(a => (
                <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>
              ))}
            </Select>
          </Form.Item>

          {availableCredits.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 13 }}>Available Vendor Credits</Text>
              {availableCredits.map(c => (
                <div key={c.id}
                  onClick={() => setSelectedCredit(selectedCredit?.id === c.id ? null : c)}
                  style={{
                    padding: '6px 10px', marginTop: 6, borderRadius: 6, cursor: 'pointer',
                    border: selectedCredit?.id === c.id ? '2px solid #1890ff' : '1px solid #d9d9d9',
                    background: selectedCredit?.id === c.id ? '#e6f7ff' : '#fff',
                    display: 'flex', justifyContent: 'space-between'
                  }}>
                  <span>{c.reference || `Credit #${c.id}`}</span>
                  <Text strong>{cSym} {Number(c.remaining_amount).toFixed(2)}</Text>
                </div>
              ))}
              {selectedCredit && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  Credit of {cSym} {Math.min(selectedCredit.remaining_amount, payAmount).toFixed(2)} will be applied
                </Text>
              )}
            </div>
          )}

          <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12, color: '#555' }}>
            <strong>Accounting:</strong>
            {(() => {
              const creditAmt = selectedCredit ? Math.min(selectedCredit.remaining_amount, payAmount) : 0;
              const cashAmt = payAmount - creditAmt;
              return (
                <>
                  {creditAmt > 0 && <div>Vendor Credit — reduces AP: {cSym} {creditAmt.toFixed(2)}</div>}
                  <div>DR Accounts Payable {cSym} {cashAmt.toFixed(2)} &nbsp;/&nbsp; CR Bank Account {cSym} {cashAmt.toFixed(2)}</div>
                </>
              );
            })()}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default BillTracker;