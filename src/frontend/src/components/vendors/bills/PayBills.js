import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Table, Button, message, Modal, Form, DatePicker, Select, Row, Col, InputNumber, Typography, Space, Tag, Divider, Input } from 'antd';
import { DollarOutlined, FileTextOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

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

  // Read optional ?vendor= filter from the URL (e.g. "Go to Pay Bills" from Check Printing)
  useEffect(() => {
    const v = new URLSearchParams(location.search).get('vendor');
    if (v) {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) setVendorFilter(parsed);
    }
  }, [location.search]);

  const selectedBills = useMemo(() => bills.filter(b => selectedRowKeys.includes(b.id)), [bills, selectedRowKeys]);

  const openPayModal = (record) => {
    if (record) {
      setSelectedRowKeys([record.id]);
      payForm.setFieldsValue({
        paymentDate: moment(),
        bankAccount: bankAccounts[0]?.id != null ? Number(bankAccounts[0].id) : (bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined),
      });
      setPayModalVisible(true);
      return;
    }
    if (selectedRowKeys.length === 0) { message.warning('Select at least one bill to pay'); return; }
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.id != null ? Number(bankAccounts[0].id) : (bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined),
    });
    setPayModalVisible(true);
  };

  const totalAmount = selectedBills.reduce((s, b) => s + Number(b.amount || 0), 0);

  const handlePay = async (values) => {
    try {
      setPaying(true);
      const paymentDate = values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const bankName = values.bankAccount;
      const bankAccount = bankAccounts.find(a => String(a.id) === String(bankName))
        || bankAccounts.find(a => (a.accountName || a.name) === bankName);
      const createdChecks = [];

      // Get next check number
      const stats = await window.electronAPI.getCheckStats?.().catch(() => null);
      let nextNum = stats?.nextCheckNumber ? parseInt(stats.nextCheckNumber, 10) : 1001;

      for (const bill of selectedBills) {
        const amt = Number(bill.amount || 0);
        if (amt <= 0) continue;

        const checkTx = {
          date: paymentDate,
          type: 'Check',
          amount: amt,
          description: `Payment for bill ${bill.ref_no || bill.id} - ${bill.payee_name || ''}`,
          reference: String(nextNum++),
          accountId: bankAccount ? Number(bankAccount.id) : undefined,
          payee_name: bill.payee_name || '',
          entered_by: 'system',
          splitLines: [{ account: 'Accounts Payable', description: `Bill payment ${bill.ref_no || bill.id}`, amount: amt }],
        };
        const checkRes = await window.electronAPI.insertTransaction(checkTx);
        if (!checkRes || (!checkRes.changes && !checkRes.success)) {
          throw new Error(`Failed to create check for bill ${bill.ref_no || bill.id}`);
        }
        const checkId = checkRes.lastInsertRowid || checkRes.id;
        createdChecks.push({ checkId, billId: bill.id, billRef: bill.ref_no || bill.id, amount: amt, payee: bill.payee_name, bankName, paymentDate });

        const payRes = await window.electronAPI.markExpensePaid(bill.id);
        if (!payRes?.success) {
          throw new Error(payRes?.error || `Failed to mark bill ${bill.ref_no || bill.id} as paid`);
        }
      }

      setCreatedChecks(createdChecks);
      setPrintOption('now');
      setPrintOptionVisible(true);
      message.success(`${selectedBills.length} bill(s) paid. Checks created.`);
      setPayModalVisible(false);
      payForm.resetFields();
      setSelectedRowKeys([]);
      await loadBills();
    } catch (err) {
      message.error(err.message || 'Failed to process payment');
    } finally { setPaying(false); }
  };

  const handlePrintNow = () => {
    setPrintOptionVisible(false);
    message.success('Opening check for printing...');
    history.push(`/main/accountant/check-printing?checkId=${createdChecks[0]?.checkId || ''}`);
  };

  const handlePrintLater = () => {
    setPrintOptionVisible(false);
    message.success('Checks saved. Print later from Check Printing screen.');
  };

  const filteredBills = useMemo(() => {
    let list = bills;
    if (vendorFilter) {
      list = list.filter(b => Number(b.payee) === Number(vendorFilter));
    }
    if (!searchText) return list;
    const q = searchText.toLowerCase();
    return list.filter(b =>
      (b.ref_no || '').toLowerCase().includes(q) ||
      (b.payee_name || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q)
    );
  }, [bills, searchText, vendorFilter]);

  const vendorOptions = useMemo(() => {
    const map = new Map();
    for (const b of bills) {
      if (b.payee && b.payee_name && !map.has(Number(b.payee))) {
        map.set(Number(b.payee), b.payee_name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bills]);

  const columns = [
    { title: 'Bill #', dataIndex: 'ref_no', key: 'ref_no', render: (v, r) => <Text strong>{v || `#${r.id}`}</Text> },
    { title: 'Vendor', dataIndex: 'payee_name', key: 'payee_name' },
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => <Text strong>{cSym} {Number(a||0).toFixed(2)}</Text> },
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

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span><FileTextOutlined style={{ marginRight: 8 }} />Pay Bills — Auto-Create Check</span>
      } extra={<Button type="primary" icon={<DollarOutlined />} disabled={selectedRowKeys.length === 0} onClick={openPayModal}>Pay Selected ({selectedRowKeys.length})</Button>}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input prefix={<SearchOutlined />} allowClear placeholder="Search bill #, vendor, description" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 300 }} />
          <Select allowClear showSearch optionFilterProp="children" placeholder="Filter by vendor" value={vendorFilter || undefined} onChange={v => { setVendorFilter(v ? Number(v) : null); setSelectedRowKeys([]); }} style={{ width: 220 }}>
            {vendorOptions.map(([id, name]) => <Option key={id} value={id}>{name}</Option>)}
          </Select>
          {vendorFilter && (
            <Button size="small" onClick={() => setVendorFilter(null)}>Clear Vendor Filter</Button>
          )}
        </Space>
        <Table
          columns={columns}
          dataSource={filteredBills}
          loading={loading}
          rowKey={r => r.id}
          rowSelection={rowSelection}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: t => `${t} unpaid bills` }}
          size="middle"
        />
      </Card>

      <Modal
        title={<span><DollarOutlined style={{ marginRight: 8 }} />Pay {selectedBills.length} Bill(s) — Creates Check(s)</span>}
        visible={payModalVisible}
        onCancel={() => { setPayModalVisible(false); setSelectedRowKeys([]); payForm.resetFields(); }}
        onOk={() => payForm.submit()}
        confirmLoading={paying}
        okText={`Pay ${selectedBills.length} Bill(s) & Print Check(s)`}
        width={500}
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
              <Form.Item label="Total to Pay">
                <Text strong style={{ fontSize: 16 }}>{cSym} {totalAmount.toFixed(2)}</Text>
                <div><Text type="secondary">{selectedBills.length} bill(s)</Text></div>
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
              1. A check transaction will be created for each selected bill<br />
              2. The check will be posted to the register of the selected bank account<br />
              3. Accounting entry: DR Accounts Payable / CR {(() => { const b = payForm.getFieldValue('bankAccount'); const acc = bankAccounts.find(a => String(a.id) === String(b)) || bankAccounts.find(a => (a.accountName || a.name) === b); return (acc && (acc.accountName || acc.name)) || 'Bank'; })()}<br />
              4. The bill will be marked as Paid<br />
              5. You can print the check from the Check Printing screen
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
