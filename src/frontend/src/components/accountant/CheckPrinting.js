import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, InputNumber, DatePicker, Select, Button, Row, Col, message, Table, Tag, Space, Typography, Divider, Alert, Tooltip, Modal, Statistic } from 'antd';
import { PrinterOutlined, SaveOutlined, EyeOutlined, HistoryOutlined, DeleteOutlined, SearchOutlined, DollarOutlined, BankOutlined, WarningOutlined, CheckCircleOutlined, StopOutlined, PlusOutlined } from '@ant-design/icons';
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

  const [amount, setAmount] = useState(0);
  const [watchDate, setWatchDate] = useState(null);
  const [watchPayeeName, setWatchPayeeName] = useState('');
  const [watchCheckNumber, setWatchCheckNumber] = useState('');
  const [watchMemo, setWatchMemo] = useState('');
  const [watchAccountId, setWatchAccountId] = useState(null);
  const [splitLines, setSplitLines] = useState([{ key: 1, account: '', description: '', amount: 0 }]);

  const splitTotal = useMemo(() => splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [splitLines]);

  const addSplitLine = () => setSplitLines(prev => [...prev, { key: Date.now(), account: '', description: '', amount: 0 }]);
  const removeSplitLine = (key) => setSplitLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  const updateSplitLine = (key, field, value) => setSplitLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

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
    const dateStr = vals.date ? (vals.date.format ? vals.date.format('M/D/YYYY') : vals.date) : '';
    const payeeName = vals.payeeName || '';
    const payeeAddr = vals.payeeAddress || '';
    const amt = Number(vals.amount || 0);
    const amtStr = amt.toFixed(2);
    const checkNum = vals.checkNumber || '';
    const routingNum = vals.routingNumber || '';
    const accountNum = vals.accountNumber || '';
    const memoLine = vals.memo || '';
    const bankName = vals.accountName || '';
    const splitLns = (vals.splitLines || []).filter(l => Number(l.amount) > 0);

    // Company info
    const co = vals._company || {};
    const coName = co.name || '';
    const coAddr = co.address || '';
    const coCity = co.city ? `${co.city}${co.state ? ', ' + co.state : ''}${co.zip ? ' ' + co.zip : ''}` : '';
    const coPhone = co.phone || '';

    const words = (() => {
      const dollars = Math.floor(amt);
      const cents = Math.round((amt - dollars) * 100);
      return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100`;
    })();

    // MICR line
    const micrRouting = routingNum ? `\u2446${routingNum}\u2446` : '\u2446000000000\u2446';
    const micrAccount = accountNum ? `${accountNum}\u2448` : '0000000000\u2448';
    const micrCheck  = checkNum   ? `${checkNum}\u2468` : '';
    const micrLine   = `${micrRouting} ${micrAccount} ${micrCheck}`;

    // Remittance rows for stubs
    const stubDetailRows = splitLns.length > 0
      ? splitLns.map(l => `
          <tr>
            <td style="padding:1px 0; font-size:11px;">${l.description || l.account || ''}</td>
            <td></td><td></td>
            <td style="padding:1px 0; font-size:11px; text-align:right;">${Number(l.amount||0).toFixed(2)}</td>
          </tr>`).join('')
      : memoLine ? `<tr>
          <td style="padding:1px 0; font-size:11px;">${memoLine}</td>
          <td></td><td></td>
          <td style="padding:1px 0; font-size:11px; text-align:right;">${amtStr}</td>
        </tr>` : '';

    // Stub section — matches image: payeeName | (spacer) | date | checkNum | amount
    const stub = (borderTop, borderBottom) => `
      <div style="height:190px; padding:10px 36px 0 36px; box-sizing:border-box;
                  border-top:${borderTop || 'none'}; border-bottom:${borderBottom || 'none'};">
        <table style="width:100%; border-collapse:collapse; font-family:Arial,sans-serif;">
          <thead>
            <tr style="border-bottom:1px solid #ccc;">
              <th style="font-size:10px; font-weight:600; text-align:left; padding-bottom:3px; width:35%;">PAY TO</th>
              <th style="font-size:10px; font-weight:600; text-align:left; padding-bottom:3px; width:22%;">DATE</th>
              <th style="font-size:10px; font-weight:600; text-align:right; padding-bottom:3px; width:20%;">CHECK NO.</th>
              <th style="font-size:10px; font-weight:600; text-align:right; padding-bottom:3px; width:23%;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-size:12px; font-weight:700; padding:4px 0 2px 0;">${payeeName}</td>
              <td style="font-size:12px; padding:4px 0 2px 0;">${dateStr}</td>
              <td style="font-size:12px; text-align:right; padding:4px 0 2px 0;">${checkNum}</td>
              <td style="font-size:12px; font-weight:700; text-align:right; padding:4px 0 2px 0;">${amtStr}</td>
            </tr>
            ${stubDetailRows}
          </tbody>
        </table>
      </div>`;

    return `<!doctype html><html><head><title>Check #${checkNum}</title>
    <style>
      @page { margin: 0.25in 0.4in; size: letter portrait; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
      .check-section { width: 100%; }
      .micr { font-family: 'MICR Encoding', 'Courier New', monospace; font-size: 14px; letter-spacing: 3px; }
    </style></head><body>
    <div class="check-section">

      <!-- ═══════════════ TOP STUB ═══════════════ -->
      ${stub('none', '1px solid #aaa')}

      <!-- ═══════════════ CHECK BODY (middle third) ═══════════════ -->
      <div style="height:340px; padding:16px 36px 0 36px; position:relative; border-bottom:1px solid #aaa;">

        <!-- Row 1: Company info (left) + Bank name (center) + Check number (right) -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div style="font-size:11px; line-height:1.5; min-width:160px;">
            ${coName  ? `<div style="font-weight:700; font-size:13px;">${coName}</div>` : ''}
            ${coAddr  ? `<div>${coAddr}</div>` : ''}
            ${coCity  ? `<div>${coCity}</div>` : ''}
            ${coPhone ? `<div>${coPhone}</div>` : ''}
          </div>
          <div style="font-size:11px; text-align:center; color:#555; flex:1; padding:0 12px;">
            ${bankName ? `<div style="font-weight:600;">${bankName}</div>` : ''}
          </div>
          <div style="text-align:right; min-width:80px;">
            <div style="font-size:18px; font-weight:700;">${checkNum}</div>
          </div>
        </div>

        <!-- Row 2: Date line -->
        <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:10px;">
          <span style="font-size:11px; margin-right:6px;">DATE</span>
          <span style="font-size:13px; font-weight:600; border-bottom:1px solid #333; min-width:90px; text-align:center;">${dateStr}</span>
        </div>

        <!-- Row 3: PAY TO THE ORDER OF -->
        <div style="display:flex; align-items:baseline; margin-bottom:6px; gap:8px;">
          <span style="font-size:10px; white-space:nowrap; font-weight:600;">PAY TO THE<br/>ORDER OF</span>
          <span style="font-size:13px; font-weight:700; flex:1; border-bottom:1px solid #333; padding-bottom:2px; padding-left:6px;">${payeeName}</span>
          <span style="font-size:12px; white-space:nowrap; font-weight:700; border:1px solid #333; padding:2px 8px; min-width:90px; text-align:center;">$ **${amtStr}</span>
        </div>

        <!-- Row 4: Written amount line -->
        <div style="display:flex; align-items:baseline; margin-bottom:12px; gap:8px;">
          <span style="font-size:13px; font-weight:700; flex:1; border-bottom:1px solid #333; padding-bottom:2px; overflow:hidden; white-space:nowrap;">
            ${words}**${'*'.repeat(Math.max(0, 70 - words.length))}
          </span>
          <span style="font-size:10px; font-weight:700; white-space:nowrap; padding-left:4px;">DOLLARS</span>
        </div>

        <!-- Row 5: Payee address (envelope window) -->
        <div style="padding-left:8px; font-size:12px; line-height:1.8; min-height:52px;">
          ${payeeName ? `<div style="font-weight:700;">${payeeName}</div>` : ''}
          ${payeeAddr ? payeeAddr.split('\n').map(l => `<div>${l}</div>`).join('') : ''}
        </div>

        <!-- Row 6: Memo + Signature line -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; position:absolute; bottom:16px; left:36px; right:36px;">
          <div style="font-size:11px; min-width:220px;">
            <span style="font-weight:600;">MEMO </span>
            <span style="border-bottom:1px solid #333; display:inline-block; min-width:160px; padding-bottom:1px;">${memoLine}</span>
          </div>
          <div style="font-size:10px; text-align:center; min-width:180px;">
            <div style="border-top:1px solid #333; padding-top:3px;">AUTHORIZED SIGNATURE</div>
          </div>
        </div>

        <!-- Row 7: MICR line -->
        <div class="micr" style="position:absolute; bottom:2px; left:36px; right:36px; text-align:center; color:#1a1a1a;">
          ${micrLine}
        </div>

      </div>

      <!-- ═══════════════ BOTTOM STUB ═══════════════ -->
      ${stub('none', 'none')}

    </div>
    </body></html>`;
  };

  const handlePreview = () => {
    const vals = form.getFieldsValue(true);
    vals.accountName = selectedAccount?.accountName || selectedAccount?.name || '';
    vals.splitLines = splitLines.filter(l => l.amount > 0);
    vals.payeeAddress = vals.payeeAddress || '';
    vals._company = company;
    setPreviewHtml(generateCheckHtml(vals, false));
    setPreviewVisible(true);
  };

  const handlePrint = (vals) => {
    vals.accountName = vals.accountName || selectedAccount?.accountName || selectedAccount?.name || '';
    vals.payeeAddress = vals.payeeAddress || form.getFieldValue('payeeAddress') || '';
    vals._company = vals._company || company;
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
      const totalAmt = splitLines.length > 1 ? splitTotal : Number(values.amount || 0);
      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        type: 'Check',
        amount: totalAmt,
        description: values.memo || `Check #${values.checkNumber || ''} to ${values.payeeName || ''}`,
        reference: values.checkNumber || undefined,
        accountId: Number(values.accountId),
        entered_by: 'system',
        splitLines: splitLines.filter(l => Number(l.amount) > 0).map(l => ({ account: l.account, description: l.description, amount: Number(l.amount) })),
      };
      await window.electronAPI.insertTransaction(payload);
      message.success(`Check #${values.checkNumber} recorded successfully`);
      const vals = { ...values, accountName: selectedAccount?.accountName || selectedAccount?.name, splitLines: splitLines.filter(l => l.amount > 0), _company: company };
      handlePrint(vals);
      form.resetFields();
      setSplitLines([{ key: 1, account: '', description: '', amount: 0 }]);
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
                    <DatePicker style={{ width: '100%' }} onChange={(d) => setWatchDate(d)} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="accountId" label="Bank Account" rules={[{ required: true, message: 'Select bank account' }]}>
                    <Select showSearch optionFilterProp="children" placeholder="Select bank account" onChange={(v) => setWatchAccountId(v)}>
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
                    <Input placeholder={suggestedCheckNum} onChange={(e) => setWatchCheckNumber(e.target.value)} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="payee" label="Pay To">
                    <Select showSearch optionFilterProp="children" placeholder="Select payee" allowClear onChange={(val, opt) => { const name = opt?.children || ''; form.setFieldsValue({ payeeName: name }); setWatchPayeeName(name); }}>
                      {payees.map(p => (
                        <Option key={p.id} value={p.id}>{p.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="payeeName" label="Payee Name">
                    <Input placeholder="Or type payee name directly" onChange={(e) => setWatchPayeeName(e.target.value)} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="amount" label="Amount ($)" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} formatter={v => v ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} onChange={(v) => setAmount(v || 0)} />
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

              <Form.Item name="payeeAddress" label="Payee Address">
                <TextArea rows={2} placeholder={"P.O. Box 399\nGratz Pa 17030"} style={{ fontFamily: 'inherit' }} />
              </Form.Item>

              <Form.Item name="memo" label="Memo">
                <TextArea rows={2} placeholder="What is this check for?" maxLength={200} showCount onChange={(e) => setWatchMemo(e.target.value)} />
              </Form.Item>

              <Divider orientation="left" style={{ fontSize: 13 }}>Split Lines (Expense Accounts)</Divider>
              <div style={{ marginBottom: 12 }}>
                {splitLines.map((line, idx) => (
                  <Row gutter={8} key={line.key} style={{ marginBottom: 6 }}>
                    <Col xs={24} sm={8}>
                      <Select size="small" placeholder="Account" value={line.account || undefined} onChange={v => updateSplitLine(line.key, 'account', v)} style={{ width: '100%' }} showSearch optionFilterProp="children" allowClear>
                        {accounts.map(a => <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>)}
                      </Select>
                    </Col>
                    <Col xs={24} sm={9}>
                      <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} />
                    </Col>
                    <Col xs={24} sm={5}>
                      <InputNumber size="small" min={0} step={0.01} placeholder="Amount" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} style={{ width: '100%' }} />
                    </Col>
                    <Col xs={24} sm={2}>
                      {splitLines.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSplitLine(line.key)} />}
                    </Col>
                  </Row>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button size="small" type="dashed" onClick={addSplitLine} icon={<PlusOutlined />}>Add Line</Button>
                  {splitLines.length > 1 && <Text type="secondary" style={{ fontSize: 12 }}>Split Total: ${cSym} {splitTotal.toFixed(2)}</Text>}
                </div>
              </div>

              <Space wrap>
                <Button icon={<EyeOutlined />} onClick={handlePreview}>Preview</Button>
                <Button icon={<PrinterOutlined />} onClick={() => { const vals = form.getFieldsValue(true); vals.accountName = selectedAccount?.accountName || selectedAccount?.name || ''; vals.splitLines = splitLines; handlePrint(vals); }}>Print Only</Button>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>Record &amp; Print</Button>
              </Space>
            </Form>
          </Card>
        </Col>

        {/* Live Preview */}
        <Col xs={24} lg={10}>
          <Card title={<><EyeOutlined style={{ marginRight: 4 }} /> Live Preview</>} size="small" bodyStyle={{ padding: 8, overflow: 'auto' }}>
            <div style={{ transform: 'scale(0.36)', transformOrigin: 'top left', height: 310, width: '278%', overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: generateCheckHtml({
                date: watchDate ? { format: (f) => watchDate.format(f) } : null,
                payeeName: watchPayeeName || '',
                payeeAddress: form.getFieldValue('payeeAddress') || '',
                amount: splitLines.length > 1 ? splitTotal : (amount || 0),
                checkNumber: watchCheckNumber || '',
                memo: watchMemo || '',
                accountName: selectedAccount?.accountName || selectedAccount?.name || '',
                splitLines: splitLines.filter(l => l.amount > 0),
                routingNumber: form.getFieldValue('routingNumber') || '',
                accountNumber: form.getFieldValue('accountNumber') || '',
                _company: company,
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
