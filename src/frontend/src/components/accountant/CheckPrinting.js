import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, InputNumber, DatePicker, Select, Button, Row, Col, message, Table, Tag, Space, Typography, Divider, Alert, Tooltip, Modal, Statistic } from 'antd';
import { PrinterOutlined, SaveOutlined, EyeOutlined, HistoryOutlined, DeleteOutlined, SearchOutlined, DollarOutlined, BankOutlined, WarningOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
const { TextArea } = Input;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toWords = (num) => {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const chunk = (n) => {
    let str = '';
    if (n >= 100) { str += a[Math.floor(n/100)] + ' Hundred '; n = n % 100; }
    if (n >= 20) { str += b[Math.floor(n/10)] + (n%10?'-'+a[n%10]:''); }
    else if (n > 0) { str += a[n]; }
    return str.trim();
  };
  if (num === 0) return 'Zero';
  let words = '';
  const billions = Math.floor(num / 1_000_000_000); if (billions) { words += chunk(billions) + ' Billion '; num %= 1_000_000_000; }
  const millions = Math.floor(num / 1_000_000); if (millions) { words += chunk(millions) + ' Million '; num %= 1_000_000; }
  const thousands = Math.floor(num / 1000); if (thousands) { words += chunk(thousands) + ' Thousand '; num %= 1000; }
  if (num) words += chunk(num);
  return words.trim();
};

const CheckPrinting = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payees, setPayees] = useState([]);
  const [checkHistory, setCheckHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [company, setCompany] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [accRes, vendorsRes, customersRes, employeesRes, companyRes, txnRes] = await Promise.all([
        window.electronAPI.getChartOfAccounts(),
        window.electronAPI.getAllSuppliers().catch(() => []),
        window.electronAPI.getAllCustomers().catch(() => ({ all: [] })),
        window.electronAPI.getEmployees ? window.electronAPI.getEmployees().catch(() => []) : Promise.resolve([]),
        window.electronAPI.getCompany?.().catch(() => ({})),
        window.electronAPI.getTransactions?.().catch(() => []),
      ]);

      const accs = Array.isArray(accRes) ? accRes : (accRes?.data || []);
      setAccounts(accs);

      // Filter bank/cash accounts for the dropdown
      const banks = accs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings');
      });
      setBankAccounts(banks.length > 0 ? banks : accs);

      // Payees
      const vendors = Array.isArray(vendorsRes) ? vendorsRes : (vendorsRes?.data || vendorsRes?.all || []);
      const customers = Array.isArray(customersRes?.all) ? customersRes.all : (Array.isArray(customersRes) ? customersRes : []);
      const employees = Array.isArray(employeesRes?.data) ? employeesRes.data : (Array.isArray(employeesRes) ? employeesRes : []);
      const merged = [
        ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || v.name || `${v.first_name||''} ${v.last_name||''}`.trim(), type: 'Vendor' })),
        ...customers.map(c => ({ id: `c-${c.id}`, name: c.display_name || `${c.first_name||''} ${c.last_name||''}`.trim(), type: 'Customer' })),
        ...employees.map(e => ({ id: `e-${e.id}`, name: e.name || `${e.first_name||''} ${e.last_name||''}`.trim(), type: 'Employee' })),
      ].filter(p => p.name);
      setPayees(merged);

      // Company info
      if (companyRes && !companyRes.error) setCompany(companyRes);

      // Check history from transactions
      const txns = Array.isArray(txnRes) ? txnRes : [];
      const checks = txns.filter(t => (t.type || '').toLowerCase() === 'check' || (t.reference || '').match(/^\d+$/))
        .map((t, i) => ({ ...t, key: t.id || i }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setCheckHistory(checks);
    } catch (e) {
      console.error('Failed to load check data:', e);
      setAccounts([]); setPayees([]);
    }
  };

  const amount = Form.useWatch('amount', form) || 0;
  const watchDate = Form.useWatch('date', form);
  const watchPayeeName = Form.useWatch('payeeName', form);
  const watchCheckNumber = Form.useWatch('checkNumber', form);
  const watchMemo = Form.useWatch('memo', form);
  const watchAccountId = Form.useWatch('accountId', form);

  const amountWords = useMemo(() => {
    const n = Number(amount || 0);
    if (n === 0) return 'Zero and 00/100 Dollars';
    const dollars = Math.floor(n);
    const cents = Math.round((n - dollars) * 100);
    return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100 Dollars`;
  }, [amount]);

  // Next check number suggestion
  const suggestedCheckNum = useMemo(() => {
    if (checkHistory.length === 0) return '1001';
    const nums = checkHistory.map(c => parseInt(c.reference || '0', 10)).filter(n => n > 0);
    return nums.length > 0 ? String(Math.max(...nums) + 1) : '1001';
  }, [checkHistory]);

  // Duplicate check detection
  const isDuplicate = useMemo(() => {
    if (!watchCheckNumber) return false;
    return checkHistory.some(c => String(c.reference) === String(watchCheckNumber) && (c.status || '').toLowerCase() !== 'void');
  }, [watchCheckNumber, checkHistory]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => String(a.id) === String(watchAccountId));
  }, [watchAccountId, accounts]);

  const generateCheckHtml = (vals, forPrint) => {
    const dateStr = vals.date ? (vals.date.format ? vals.date.format('MMMM DD, YYYY') : vals.date) : '';
    const companyName = company?.name || company?.company_name || 'Company Name';
    const companyAddr = [company?.address, company?.city, company?.state, company?.postal_code].filter(Boolean).join(', ');
    const amt = Number(vals.amount || 0);
    const words = (() => {
      const dollars = Math.floor(amt);
      const cents = Math.round((amt - dollars) * 100);
      return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100`;
    })();
    const starPad = '★'.repeat(Math.max(0, 60 - words.length));

    return `<!doctype html><html><head><title>Check #${vals.checkNumber || ''}</title>
    <style>
      @page { margin: 0; size: landscape; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: ${forPrint ? '20px' : '0'}; background: ${forPrint ? '#fff' : 'transparent'}; }
      .check-container { width: 780px; margin: 0 auto; }
      .check { border: 2px solid #334155; border-radius: 4px; padding: 24px 28px; background: #fff; position: relative; }
      .check-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
      .company-info { font-size: 11px; color: #475569; line-height: 1.5; }
      .company-name { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
      .check-number { text-align: right; }
      .check-number span { font-size: 13px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 4px 12px; border-radius: 4px; }
      .date-line { text-align: right; font-size: 13px; color: #334155; margin-bottom: 16px; }
      .date-line strong { border-bottom: 1px solid #94a3b8; padding-bottom: 1px; }
      .pay-line { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; }
      .pay-label { white-space: nowrap; color: #64748b; font-weight: 600; }
      .pay-value { flex: 1; border-bottom: 1px solid #94a3b8; padding-bottom: 2px; font-weight: 700; font-size: 14px; color: #1e293b; }
      .amount-box { border: 2px solid #334155; padding: 6px 14px; font-size: 16px; font-weight: 800; color: #1e293b; min-width: 130px; text-align: center; border-radius: 3px; background: #f8fafc; }
      .words-line { font-size: 12px; color: #334155; border-bottom: 1px solid #94a3b8; padding: 4px 0; margin-bottom: 20px; font-weight: 600; }
      .memo-sig { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 28px; }
      .memo { font-size: 12px; color: #64748b; }
      .memo strong { color: #334155; }
      .signature { text-align: center; }
      .sig-line { width: 220px; border-top: 1px solid #334155; padding-top: 4px; font-size: 11px; color: #64748b; }
      .micr-line { margin-top: 20px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-family: 'Courier New', monospace; font-size: 14px; letter-spacing: 3px; color: #475569; text-align: center; }
      .void-stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72px; color: rgba(255,0,0,0.15); font-weight: 900; pointer-events: none; }
    </style></head><body>
    <div class="check-container"><div class="check">
      <div class="check-header">
        <div class="company-info"><div class="company-name">${companyName}</div>${companyAddr ? `<div>${companyAddr}</div>` : ''}</div>
        <div class="check-number"><span>Check # ${vals.checkNumber || '____'}</span></div>
      </div>
      <div class="date-line">Date: <strong>${dateStr || '_______________'}</strong></div>
      <div class="pay-line">
        <span class="pay-label">PAY TO THE ORDER OF:</span>
        <span class="pay-value">${vals.payeeName || '________________________________'}</span>
        <span class="amount-box">$${amt.toFixed(2)}</span>
      </div>
      <div class="words-line">${words} ${starPad} DOLLARS</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">Bank: ${vals.accountName || selectedAccount?.accountName || selectedAccount?.name || ''}</div>
      <div class="memo-sig">
        <div class="memo">Memo: <strong>${vals.memo || ''}</strong></div>
        <div class="signature"><div class="sig-line">Authorized Signature</div></div>
      </div>
      <div class="micr-line">⑆${vals.routingNumber || '000000000'}⑆ ⑈${vals.accountNumber || '0000000000'}⑈ ${String(vals.checkNumber || '').padStart(6, '0')}</div>
    </div></div></body></html>`;
  };

  const handlePreview = () => {
    const vals = form.getFieldsValue(true);
    vals.accountName = selectedAccount?.accountName || selectedAccount?.name || '';
    setPreviewHtml(generateCheckHtml(vals, false));
    setPreviewVisible(true);
  };

  const handlePrint = (vals) => {
    vals.accountName = vals.accountName || selectedAccount?.accountName || selectedAccount?.name || '';
    const html = generateCheckHtml(vals, true);
    const w = window.open('', '_blank');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const onFinish = async (values) => {
    if (isDuplicate) {
      Modal.confirm({
        title: 'Duplicate Check Number',
        content: `Check #${values.checkNumber} already exists. Are you sure you want to proceed?`,
        okText: 'Proceed Anyway',
        okType: 'danger',
        onOk: () => recordAndPrint(values),
      });
      return;
    }
    await recordAndPrint(values);
  };

  const recordAndPrint = async (values) => {
    try {
      setLoading(true);
      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        type: 'Check',
        amount: Number(values.amount || 0),
        description: values.memo || `Check #${values.checkNumber || ''} to ${values.payeeName || ''}`,
        reference: values.checkNumber || undefined,
        accountId: Number(values.accountId),
        entered_by: 'system',
      };
      await window.electronAPI.insertTransaction(payload);
      message.success(`Check #${values.checkNumber} recorded successfully`);
      const vals = { ...values, accountName: selectedAccount?.accountName || selectedAccount?.name };
      handlePrint(vals);
      form.resetFields();
      form.setFieldsValue({ date: moment(), checkNumber: String(Number(values.checkNumber || 0) + 1) });
      loadData();
    } catch (e) {
      message.error('Failed to record check');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async (record) => {
    try {
      if (record.id) {
        await window.electronAPI.voidTransaction(record.id);
        message.success(`Check #${record.reference} voided`);
        loadData();
      }
    } catch { message.error('Failed to void check'); }
  };

  const handleReprintHistory = (record) => {
    const vals = {
      date: record.date ? { format: (f) => moment(record.date).format(f) } : null,
      payeeName: (record.description || '').replace(/^Check #?\d*\s*to\s*/i, '') || record.description,
      amount: record.amount || record.debit || 0,
      checkNumber: record.reference || '',
      memo: record.description || '',
      accountName: '',
      routingNumber: '', accountNumber: '',
    };
    handlePrint(vals);
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch) return checkHistory.slice(0, 50);
    const s = historySearch.toLowerCase();
    return checkHistory.filter(c =>
      (c.reference || '').toLowerCase().includes(s) ||
      (c.description || '').toLowerCase().includes(s)
    ).slice(0, 50);
  }, [checkHistory, historySearch]);

  // Stats
  const totalChecks = checkHistory.length;
  const totalAmt = checkHistory.reduce((s, c) => s + Number(c.amount || c.debit || 0), 0);
  const thisMonthChecks = checkHistory.filter(c => c.date && moment(c.date).isSame(moment(), 'month'));

  const historyColumns = [
    { title: '#', dataIndex: 'reference', key: 'reference', width: 80, render: v => <Text strong>{v || '-'}</Text> },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('DD MMM YY') : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: (v, r) => <Text strong>${fmt(v || r.debit || 0)}</Text> },
    { title: 'Status', key: 'status', width: 80, render: (_, r) => {
      const s = (r.status || 'active').toLowerCase();
      return s === 'void' ? <Tag color="red">Void</Tag> : <Tag color="green">Active</Tag>;
    }},
    { title: 'Actions', key: 'actions', width: 120, render: (_, r) => (
      <Space size="small">
        <Tooltip title="Reprint"><Button type="text" size="small" icon={<PrinterOutlined />} onClick={() => handleReprintHistory(r)} /></Tooltip>
        {(r.status || '').toLowerCase() !== 'void' && (
          <Tooltip title="Void"><Button type="text" size="small" danger icon={<StopOutlined />} onClick={() => Modal.confirm({ title: `Void Check #${r.reference}?`, content: 'This will mark the check as voided.', okText: 'Void', okType: 'danger', onOk: () => handleVoid(r) })} /></Tooltip>
        )}
      </Space>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><PrinterOutlined style={{ marginRight: 8 }} />Check Printing</Title>
          <Text type="secondary">Write, record, and print checks &middot; {totalChecks} checks on file</Text>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Checks" value={totalChecks} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Amount" value={totalAmt} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="This Month" value={thisMonthChecks.length} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title="Next Check #" value={suggestedCheckNum} valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Check Form */}
        <Col xs={24} lg={14}>
          <Card title={<><DollarOutlined style={{ marginRight: 4 }} /> Write a Check</>} size="small">
            {isDuplicate && (
              <Alert message={`Check #${watchCheckNumber} already exists!`} type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }} />
            )}

            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: moment(), checkNumber: suggestedCheckNum }}>
              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="accountId" label="Bank Account" rules={[{ required: true, message: 'Select bank account' }]}>
                    <Select showSearch optionFilterProp="children" placeholder="Select bank account">
                      {bankAccounts.map(a => (
                        <Option key={a.id} value={a.id}>
                          {a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="checkNumber" label="Check #" rules={[{ required: true, message: 'Required' }]} validateStatus={isDuplicate ? 'warning' : undefined} help={isDuplicate ? 'Duplicate number' : undefined}>
                    <Input placeholder={suggestedCheckNum} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="payee" label="Pay To">
                    <Select showSearch optionFilterProp="children" placeholder="Select payee" allowClear onChange={(val, opt) => form.setFieldsValue({ payeeName: opt?.children })}>
                      {payees.map(p => (
                        <Option key={p.id} value={p.id}>{p.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="payeeName" label="Payee Name">
                    <Input placeholder="Or type payee name directly" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="amount" label="Amount ($)" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} formatter={v => v ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={16}>
                  <Form.Item label="Amount in Words">
                    <Input value={amountWords} readOnly style={{ fontStyle: 'italic', background: '#f9f9f9' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="routingNumber" label="Routing Number">
                    <Input placeholder="For MICR line (optional)" maxLength={9} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="accountNumber" label="Account Number">
                    <Input placeholder="For MICR line (optional)" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="memo" label="Memo">
                <TextArea rows={2} placeholder="What is this check for?" maxLength={200} showCount />
              </Form.Item>

              <Space wrap>
                <Button icon={<EyeOutlined />} onClick={handlePreview}>Preview</Button>
                <Button icon={<PrinterOutlined />} onClick={() => { const vals = form.getFieldsValue(true); vals.accountName = selectedAccount?.accountName || selectedAccount?.name || ''; handlePrint(vals); }}>Print Only</Button>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>Record &amp; Print</Button>
              </Space>
            </Form>
          </Card>
        </Col>

        {/* Live Preview */}
        <Col xs={24} lg={10}>
          <Card title={<><EyeOutlined style={{ marginRight: 4 }} /> Live Preview</>} size="small" bodyStyle={{ padding: 8, overflow: 'auto' }}>
            <div style={{ transform: 'scale(0.48)', transformOrigin: 'top left', height: 220, width: '208%' }}>
              <div dangerouslySetInnerHTML={{ __html: generateCheckHtml({
                date: watchDate ? { format: (f) => watchDate.format(f) } : null,
                payeeName: watchPayeeName || '',
                amount: amount || 0,
                checkNumber: watchCheckNumber || '',
                memo: watchMemo || '',
                accountName: selectedAccount?.accountName || selectedAccount?.name || '',
                routingNumber: form.getFieldValue('routingNumber') || '',
                accountNumber: form.getFieldValue('accountNumber') || '',
              }, false) }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Check History */}
      <Card title={<><HistoryOutlined style={{ marginRight: 4 }} /> Check History</>} size="small" style={{ marginTop: 16 }}
        extra={<Input placeholder="Search checks..." prefix={<SearchOutlined />} value={historySearch} onChange={e => setHistorySearch(e.target.value)} allowClear style={{ width: 200 }} />}
      >
        <Table
          columns={historyColumns}
          dataSource={filteredHistory}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `${t} checks` }}
          scroll={{ x: 600 }}
          locale={{ emptyText: 'No checks recorded yet' }}
        />
      </Card>

      {/* Preview Modal */}
      <Modal title="Check Preview" visible={previewVisible} onCancel={() => setPreviewVisible(false)} width={860} footer={[
        <Button key="close" onClick={() => setPreviewVisible(false)}>Close</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => { const vals = form.getFieldsValue(true); vals.accountName = selectedAccount?.accountName || selectedAccount?.name || ''; handlePrint(vals); setPreviewVisible(false); }}>Print</Button>,
      ]}>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Modal>
    </div>
  );
};

export default CheckPrinting;
