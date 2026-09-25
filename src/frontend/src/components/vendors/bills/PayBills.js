import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, Table, Button, message, Modal, Form, DatePicker, Select, Row, Col, InputNumber, Typography, Space, Tag, Divider, Input, Alert, Statistic } from 'antd';
import { DollarOutlined, FileTextOutlined, EyeOutlined, SearchOutlined, CreditCardOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { sumMoney } from '../../../utils/money';

import AccountSelect from '../../shared/AccountSelect';
import { useHistory, useLocation } from 'react-router-dom';

const { Option } = Select;
const { Text } = Typography;

const PayBills = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const location = useLocation();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [vendorFilter, setVendorFilter] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [payForm] = Form.useForm();
  const [paying, setPaying] = useState(false);
  const [printOptionVisible, setPrintOptionVisible] = useState(false);
  const [createdChecks, setCreatedChecks] = useState([]);
  const [printOption, setPrintOption] = useState('now');

  // Vendor credits
  const [availableCredits, setAvailableCredits] = useState([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [selectedCreditIds, setSelectedCreditIds] = useState([]);
  const [creditAmounts, setCreditAmounts] = useState({});

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const [data, accs] = await Promise.all([
        window.electronAPI.getAllExpenses(),
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
      ]);
      const list = Array.isArray(data) ? data : (data && data.data) ? data.data : [];
      const allAccs = Array.isArray(accs) ? accs : (accs?.data || []);
      setAllAccounts(allAccs);
      setBankAccounts(allAccs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        return t.includes('bank') || t.includes('cash');
      }));
      setBills(list.filter(b => (b.category === 'bill' || b.category === 'supplier') && (b.approval_status || '').toLowerCase() !== 'paid'));
    } catch (err) {
      console.error('Failed to load bills', err);
      message.error('Failed to load bills');
      setBills([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  useEffect(() => {
    const v = new URLSearchParams(location.search).get('vendor');
    if (v) {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) setVendorFilter(parsed);
    }
  }, [location.search]);

  const selectedBills = useMemo(() => bills.filter(b => selectedRowKeys.includes(b.id)), [bills, selectedRowKeys]);

  // One vendor for all selected bills? Credits may only cross bills of the SAME vendor.
  const vendorIds = useMemo(
    () => Array.from(new Set(selectedBills.map(b => Number(b.payee)).filter(Boolean))),
    [selectedBills]
  );
  const singleVendorId = vendorIds.length === 1 ? vendorIds[0] : null;
  const mixedVendors = vendorIds.length > 1;
  const vendorName = selectedBills[0]?.payee_name || '';

  const totalRemaining = useMemo(
    () => sumMoney(selectedBills.map(b => Math.max(0, Number(b.amount || 0) - Number(b.paid_amount || 0)))),
    [selectedBills]
  );

  const creditById = useMemo(() => new Map(availableCredits.map(c => [Number(c.id), c])), [availableCredits]);

  const effectiveCreditAmount = (id) => {
    const c = creditById.get(Number(id));
    if (!c) return 0;
    return Math.min(Number(creditAmounts[id]) || 0, Number(c.remaining_amount) || 0);
  };
  const creditApplied = useMemo(
    () => sumMoney(selectedCreditIds.map(id => effectiveCreditAmount(id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCreditIds, creditAmounts, availableCredits]
  );
  const cappedCreditApplied = Math.min(creditApplied, totalRemaining);
  const bankPayment = Math.max(0, sumMoney([totalRemaining, -cappedCreditApplied]));

  const loadCredits = async (supplierId) => {
    if (!supplierId) { setAvailableCredits([]); return; }
    setCreditsLoading(true);
    try {
      const res = await window.electronAPI.vendorCreditsAvailable?.(Number(supplierId));
      const list = Array.isArray(res) ? res : [];
      setAvailableCredits(list.filter(c => String(c.status || '').toLowerCase() === 'active' && Number(c.remaining_amount) > 0.005));
    } catch { setAvailableCredits([]); }
    finally { setCreditsLoading(false); }
  };

  const resetCredits = () => { setSelectedCreditIds([]); setCreditAmounts({}); setAvailableCredits([]); };

  const openPayModal = (record) => {
    const ids = record ? [record.id] : selectedRowKeys;
    if (!ids.length) { message.warning('Select at least one bill to pay'); return; }
    setSelectedRowKeys(ids);
    resetCredits();
    const defaultBank = bankAccounts[0]?.id != null ? Number(bankAccounts[0].id) : (bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined);
    payForm.setFieldsValue({ paymentDate: moment(), bankAccount: defaultBank });
    // Load the vendor's credits for the bills being paid.
    const chosen = bills.filter(b => ids.includes(b.id));
    const vIds = Array.from(new Set(chosen.map(b => Number(b.payee)).filter(Boolean)));
    if (vIds.length === 1) loadCredits(vIds[0]);
    setPayModalVisible(true);
  };

  // Deep link from a Purchase Order (?bill=<id>): select that bill and open the
  // existing pay modal for it (same engine as normal Pay Bills).
  const billLinkAppliedRef = useRef(null);
  useEffect(() => {
    const b = new URLSearchParams(location.search).get('bill');
    if (!b) return;
    const billId = Number(b);
    if (!billId || billLinkAppliedRef.current === billId) return;
    const record = bills.find(x => Number(x.id) === billId);
    if (!record) return; // bills not loaded yet
    billLinkAppliedRef.current = billId;
    openPayModal(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, location.search]);

  // When credits are picked, default each amount to what it can cover.
  const handleCreditsChange = (ids) => {
    setSelectedCreditIds(ids);
    setCreditAmounts(prev => {
      const next = { ...prev };
      const already = sumMoney(ids.slice(0, -1).map(id => effectiveCreditAmount(id)));
      ids.forEach(id => {
        if (next[id] == null) {
          const c = creditById.get(Number(id));
          const room = Math.max(0, sumMoney([totalRemaining, -already]));
          next[id] = Math.min(Number(c?.remaining_amount) || 0, room > 0 ? room : Number(c?.remaining_amount) || 0);
        }
      });
      // Drop amounts for de-selected credits.
      Object.keys(next).forEach(k => { if (!ids.includes(Number(k)) && !ids.includes(k)) delete next[k]; });
      return next;
    });
  };

  const totalAmount = totalRemaining;

  const handlePay = async (values) => {
    try {
      setPaying(true);
      const paymentDate = values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const bankName = values.bankAccount;
      const bankAccount = bankAccounts.find(a => String(a.id) === String(bankName))
        || bankAccounts.find(a => (a.accountName || a.name) === bankName);

      const credits = selectedCreditIds
        .map(id => ({ creditId: Number(id), amount: effectiveCreditAmount(id) }))
        .filter(c => c.amount > 0.005);

      const stats = await window.electronAPI.getCheckStats?.().catch(() => null);
      let nextNum = stats?.nextCheckNumber ? parseInt(stats.nextCheckNumber, 10) : 1001;
      const newChecks = [];

      if (credits.length > 0) {
        // ONE atomic settlement: apply credits + pay the cash remainder by check.
        const res = await window.electronAPI.billSettleWithCredits?.({
          bills: selectedBills.map(b => ({ expenseId: b.id })),
          credits,
          paymentDate,
          bankAccount: bankPayment > 0.005 ? (bankAccount ? Number(bankAccount.id) : undefined) : undefined,
          checkNumber: String(nextNum),
        });
        if (!res?.success) throw new Error(res?.error || 'Settlement failed');
        (res.checks || []).forEach(c => {
          const b = selectedBills.find(x => x.id === c.billId);
          newChecks.push({ checkId: c.id, billId: c.billId, billRef: b?.ref_no || c.billId, amount: c.amount, payee: vendorName, bankName, paymentDate });
        });
        message.success(
          bankPayment > 0.005
            ? `Credits applied and ${newChecks.length} check(s) created.`
            : 'Vendor credit applied — bill settled without a bank payment.'
        );
      } else {
        // Cash-only path (unchanged): one atomic call per bill.
        for (const bill of selectedBills) {
          const amt = Number(bill.amount || 0) - Number(bill.paid_amount || 0);
          if (amt <= 0.005) continue;
          const payRes = await window.electronAPI.billPay?.({
            expenseId: bill.id, amount: amt, paymentDate,
            bankAccount: bankAccount ? Number(bankAccount.id) : undefined,
            checkNumber: String(nextNum++),
          });
          if (!payRes?.success) throw new Error(payRes?.error || `Failed to pay bill ${bill.ref_no || bill.id}`);
          newChecks.push({ checkId: payRes.check?.id, billId: bill.id, billRef: bill.ref_no || bill.id, amount: amt, payee: bill.payee_name, bankName, paymentDate });
        }
        message.success(`${selectedBills.length} bill(s) paid. Checks created.`);
      }

      setCreatedChecks(newChecks);
      setPrintOption('now');
      setPayModalVisible(false);
      payForm.resetFields();
      resetCredits();
      setSelectedRowKeys([]);
      await loadBills();
      if (newChecks.length > 0) setPrintOptionVisible(true);
    } catch (err) {
      message.error(err.message || 'Failed to process payment');
    } finally { setPaying(false); }
  };

  const handlePrintNow = () => {
    setPrintOptionVisible(false);
    message.success('Opening check for printing...');
    history.push(`/main/accountant/check-printing?checkId=${createdChecks[0]?.checkId || ''}`);
  };
  const handlePrintLater = () => { setPrintOptionVisible(false); message.success('Checks saved. Print later from Check Printing screen.'); };

  const filteredBills = useMemo(() => {
    let list = bills;
    if (vendorFilter) list = list.filter(b => Number(b.payee) === Number(vendorFilter));
    if (!searchText) return list;
    const q = searchText.toLowerCase();
    return list.filter(b =>
      (b.ref_no || '').toLowerCase().includes(q) ||
      (b.payee_name || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q));
  }, [bills, searchText, vendorFilter]);

  const vendorOptions = useMemo(() => {
    const map = new Map();
    for (const b of bills) if (b.payee && b.payee_name && !map.has(Number(b.payee))) map.set(Number(b.payee), b.payee_name);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bills]);

  const columns = [
    { title: 'Bill #', dataIndex: 'ref_no', key: 'ref_no', render: (v, r) => <Text strong>{v || `#${r.id}`}</Text> },
    { title: 'Vendor', dataIndex: 'payee_name', key: 'payee_name' },
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (a, r) => <Text strong>{money(Math.max(0, Number(a || 0) - Number(r.paid_amount || 0)))}</Text> },
    { title: 'Status', dataIndex: 'approval_status', key: 'status', render: s => <Tag color={s === 'Paid' ? 'green' : s === 'Partial' ? 'orange' : 'volcano'}>{s || 'Unpaid'}</Tag> },
    { title: 'Action', key: 'action', width: 200,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => history.push(`/main/vendors/bills/edit/${r.id}`)}>View</Button>
          <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPayModal(r)}>Pay</Button>
        </Space>
      )
    }
  ];

  const rowSelection = { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) };

  const bankLabel = (() => {
    const b = payForm.getFieldValue('bankAccount');
    const acc = bankAccounts.find(a => String(a.id) === String(b)) || bankAccounts.find(a => (a.accountName || a.name) === b);
    return (acc && (acc.accountName || acc.name)) || 'Bank';
  })();

  const okText = bankPayment > 0.005
    ? `Record Payment & Print Check${selectedBills.length > 1 ? 's' : ''}`
    : 'Apply Vendor Credit';

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span><FileTextOutlined style={{ marginRight: 8 }} />Pay Bills — Auto-Create Check</span>}
        extra={<Button type="primary" icon={<DollarOutlined />} disabled={selectedRowKeys.length === 0} onClick={() => openPayModal(null)}>Pay Selected ({selectedRowKeys.length})</Button>}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search bill #, vendor, description" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 300 }} />
          <Select allowClear showSearch optionFilterProp="children" placeholder="Filter by vendor" value={vendorFilter || undefined} onChange={v => { setVendorFilter(v ? Number(v) : null); setSelectedRowKeys([]); }} style={{ width: 220 }}>
            {vendorOptions.map(([id, name]) => <Option key={id} value={id}>{name}</Option>)}
          </Select>
          {vendorFilter && <Button size="small" onClick={() => setVendorFilter(null)}>Clear Vendor Filter</Button>}
        </Space>
        <Table columns={columns} dataSource={filteredBills} loading={loading} rowKey={r => r.id} rowSelection={rowSelection}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: t => `${t} unpaid bills` }} size="middle" />
      </Card>

      <Modal
        title={<span><DollarOutlined style={{ marginRight: 8 }} />Pay {selectedBills.length} Bill(s)</span>}
        visible={payModalVisible}
        onCancel={() => { setPayModalVisible(false); setSelectedRowKeys([]); payForm.resetFields(); resetCredits(); }}
        onOk={() => payForm.submit()}
        confirmLoading={paying}
        okText={okText}
        width={640}
        destroyOnClose
      >
        <Form form={payForm} layout="vertical" onFinish={handlePay} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Vendor">
                <Text strong>{mixedVendors ? `${vendorIds.length} vendors` : (vendorName || '-')}</Text>
                <div><Text type="secondary">{selectedBills.length} bill(s) · {money(totalRemaining)} remaining</Text></div>
              </Form.Item>
            </Col>
          </Row>

          {/* ── Vendor Credits ── */}
          {mixedVendors ? (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Mixed vendors selected" description="Vendor credits can only be applied when all selected bills belong to the same vendor. Select bills for one vendor to use credits." />
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}><CreditCardOutlined style={{ marginRight: 6 }} />Vendor Credits</div>
              {creditsLoading ? (
                <Text type="secondary">Loading available credits...</Text>
              ) : availableCredits.length === 0 ? (
                <Text type="secondary">No available Vendor Credits for {vendorName || 'this vendor'}.</Text>
              ) : (
                <>
                  <Select
                    mode="multiple"
                    style={{ width: '100%' }}
                    placeholder="Select available vendor credits"
                    value={selectedCreditIds}
                    onChange={handleCreditsChange}
                    optionFilterProp="children"
                    showSearch
                  >
                    {availableCredits.map(c => (
                      <Option key={c.id} value={Number(c.id)}>
                        {`VC-${String(c.id).padStart(5, '0')} | ${c.date ? moment(c.date).format('MM/DD/YYYY') : '-'} | Available ${money(c.remaining_amount)}`}
                      </Option>
                    ))}
                  </Select>
                  {selectedCreditIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {selectedCreditIds.map(id => {
                        const c = creditById.get(Number(id));
                        if (!c) return null;
                        return (
                          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Text style={{ flex: 1 }}>{`VC-${String(c.id).padStart(5, '0')} (${money(c.remaining_amount)} available)`}</Text>
                            <InputNumber min={0} max={Number(c.remaining_amount) || 0} precision={2} style={{ width: 140 }}
                              value={creditAmounts[id]} onChange={v => setCreditAmounts(prev => ({ ...prev, [id]: v }))} />
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleCreditsChange(selectedCreditIds.filter(x => x !== id))} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Bank payment ── */}
          <Form.Item
            name="bankAccount"
            label={bankPayment > 0.005 ? 'Bank Account (Check will be drawn from this)' : 'Bank Account (not required — covered by credits)'}
            rules={bankPayment > 0.005 ? [{ required: true, message: 'Select bank account' }] : []}
          >
            <AccountSelect accounts={bankAccounts} placeholder={bankPayment > 0.005 ? 'Select bank account' : 'Not required'} disabled={bankPayment <= 0.005} />
          </Form.Item>

          <Divider style={{ margin: '8px 0' }} />
          <Row gutter={12} style={{ marginBottom: 8 }}>
            <Col span={8}><Statistic title="Bill Balance" value={totalRemaining} precision={2} prefix={cSym} valueStyle={{ fontSize: 16 }} /></Col>
            <Col span={8}><Statistic title="Vendor Credits" value={-cappedCreditApplied} precision={2} prefix={cSym} valueStyle={{ fontSize: 16, color: '#722ed1' }} /></Col>
            <Col span={8}><Statistic title="Bank Payment" value={bankPayment} precision={2} prefix={cSym} valueStyle={{ fontSize: 16, color: '#52c41a' }} /></Col>
          </Row>

          <div style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
            <Text strong>What will happen:</Text>
            <div style={{ marginTop: 4, color: '#555' }}>
              {selectedCreditIds.length > 0 && (
                <div>1. Vendor Credit{selectedCreditIds.length > 1 ? 's' : ''} {selectedCreditIds.map(id => `VC-${String(id).padStart(5, '0')}`).join(', ')} will apply {money(cappedCreditApplied)} to the selected bill(s).</div>
              )}
              {bankPayment > 0.005 ? (
                <>
                  <div>{selectedCreditIds.length > 0 ? 2 : 1}. A Check transaction for {money(bankPayment)} will be created and posted to {bankLabel}.</div>
                  <div>{selectedCreditIds.length > 0 ? 3 : 2}. Accounting: DR Accounts Payable / CR {bankLabel}{selectedCreditIds.length > 0 ? ' (cash portion only)' : ''}.</div>
                  <div>{selectedCreditIds.length > 0 ? 4 : 3}. The bill(s) will be updated; you can print the check from Check Printing.</div>
                </>
              ) : (
                <>
                  <div>{selectedCreditIds.length > 0 ? 2 : 1}. No Check or Bank transaction will be created.</div>
                  <div>{selectedCreditIds.length > 0 ? 3 : 2}. The bill(s) will be marked Paid.</div>
                </>
              )}
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Print Checks?"
        visible={printOptionVisible}
        onCancel={handlePrintLater}
        footer={[
          <Button key="later" onClick={handlePrintLater}>Print Later</Button>,
          <Button key="now" type="primary" onClick={handlePrintNow}>Print Now</Button>,
        ]}
        width={400}
        destroyOnClose
      >
        <Text>{createdChecks.length} check(s) created. Do you want to print them now?</Text>
      </Modal>
    </div>
  );
};

export default PayBills;
