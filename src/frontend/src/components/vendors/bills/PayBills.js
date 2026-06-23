import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Button, message, Modal, Form, DatePicker, Select, Row, Col, InputNumber, Typography, Space, Tag, Divider, Radio } from 'antd';
import { PrinterOutlined, CheckCircleOutlined, DollarOutlined, FileTextOutlined, BankOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;
const { Text } = Typography;

const PayBills = () => {
  const { symbol: cSym } = useCurrency();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedBills, setSelectedBills] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
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

  const openPayModal = (record) => {
    setSelectedBills([record]);
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined,
    });
    setPayModalVisible(true);
  };

  const totalAmount = selectedBills.reduce((s, b) => s + Number(b.amount || 0), 0);

  const handlePay = async (values) => {
    try {
      setPaying(true);
      const paymentDate = values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const bankName = values.bankAccount;
      const bankAccount = bankAccounts.find(a => (a.accountName || a.name) === bankName);
      const createdChecks = [];

      for (const bill of selectedBills) {
        const amt = Number(bill.amount || 0);
        if (amt <= 0) continue;

        // 1. Auto-create a check transaction linked to the bill
        const checkTx = {
          date: paymentDate,
          type: 'Check',
          amount: amt,
          description: `Payment for bill ${bill.ref_no || bill.id} - ${bill.payee_name || ''}`,
          reference: '',
          accountId: bankAccount ? Number(bankAccount.id) : undefined,
          entered_by: 'system',
          splitLines: [{ account: 'Accounts Payable', description: `Bill payment ${bill.ref_no || bill.id}`, amount: amt }],
        };
        const checkRes = await window.electronAPI.insertTransaction(checkTx);
        if (!checkRes || (!checkRes.changes && !checkRes.success)) {
          throw new Error(`Failed to create check for bill ${bill.ref_no || bill.id}`);
        }
        const checkId = checkRes.lastInsertRowid || checkRes.id;
        createdChecks.push({ checkId, billId: bill.id, billRef: bill.ref_no || bill.id, amount: amt, payee: bill.payee_name, bankName, paymentDate });

        // 2. Mark bill as paid (journal already posted by check transaction above)
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
      setSelectedBills([]);
      await loadBills();
    } catch (err) {
      message.error(err.message || 'Failed to process payment');
    } finally { setPaying(false); }
  };

  const handlePrintNow = () => {
    setPrintOptionVisible(false);
    // Navigate to check printing with the created checks for printing
    createdChecks.forEach(check => {
      window.electronAPI?.printCheck?.(check.checkId).catch(() => {});
    });
    message.success('Opening check for printing...');
  };

  const handlePrintLater = () => {
    setPrintOptionVisible(false);
    message.success('Checks saved. Print later from Check Printing screen.');
  };

  const columns = [
    { title: 'Bill #', dataIndex: 'ref_no', key: 'ref_no', render: (v, r) => <Text strong>{v || `#${r.id}`}</Text> },
    { title: 'Vendor', dataIndex: 'payee_name', key: 'payee_name' },
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => <Text strong>{cSym} {Number(a||0).toFixed(2)}</Text> },
    { title: 'Status', dataIndex: 'approval_status', key: 'status', render: s => <Tag color={s === 'Paid' ? 'green' : s === 'Partial' ? 'orange' : 'volcano'}>{s || 'Unpaid'}</Tag> },
    { title: 'Action', key: 'action', width: 140,
      render: (_, r) => {
        const isPaid = (r.approval_status || '').toLowerCase() === 'paid';
        return <Button type="primary" icon={<DollarOutlined />} onClick={() => openPayModal(r)} disabled={isPaid}>{isPaid ? 'Paid' : 'Pay Bill'}</Button>;
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span><FileTextOutlined style={{ marginRight: 8 }} />Pay Bills — Auto-Create Check</span>}>
        <Table columns={columns} dataSource={bills} loading={loading} rowKey={r => r.id}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} unpaid bills` }} size="middle" />
      </Card>

      <Modal
        title={<span><DollarOutlined style={{ marginRight: 8 }} />Pay Bill — Creates Check</span>}
        visible={payModalVisible}
        onCancel={() => { setPayModalVisible(false); setSelectedBills([]); payForm.resetFields(); }}
        onOk={() => payForm.submit()}
        confirmLoading={paying}
        okText="Record Payment & Print Check"
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
            <Select placeholder="Select bank account" showSearch optionFilterProp="children">
              {bankAccounts.map(a => (
                <Option key={a.id} value={a.accountName || a.name}><BankOutlined style={{ marginRight: 4 }} />{a.accountName || a.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Divider />
          <div style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
            <Text strong>What will happen:</Text>
            <div style={{ marginTop: 4, color: '#555' }}>
              1. A check transaction will be created for each selected bill<br />
              2. The check will be posted to the register of the selected bank account<br />
              3. Accounting entry: DR Accounts Payable / CR {bankAccounts.find(a => (a.accountName || a.name) === payForm.getFieldValue('bankAccount'))?.accountName || 'Bank'}<br />
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
        <Radio.Group value={printOption} onChange={e => setPrintOption(e.target.value)} style={{ marginTop: 12 }}>
          <Radio value="now">Print Now</Radio>
          <Radio value="later">Print Later</Radio>
        </Radio.Group>
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Print Now: Opens check print preview immediately and marks as Printed<br />
          Print Later: Saves checks without printing. Print from Check Printing screen later.
        </div>
      </Modal>
    </div>
  );
};

export default PayBills;
