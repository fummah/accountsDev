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
        ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || v.name || `${v.first_name||''} ${v.last_name||''}`.trim(), type: 'Vendor', _raw: v })),
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

  // Auto-update the main amount field from split lines when there are multiple lines
  useEffect(() => {
    if (splitLines.length > 1 && splitTotal > 0) {
      setAmount(splitTotal);
      form.setFieldsValue({ amount: splitTotal });
    }
  }, [splitTotal, splitLines.length]);

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
    const dateStr = vals.date ? (vals.date.format ? vals.date.format('MM/DD/YYYY') : vals.date) : '';
    const payeeName = vals.payeeName || '';
    const payeeAddr = vals.payeeAddress || '';
    const amt = Number(vals.amount || 0);
    const amtStr = amt.toFixed(2);
    const checkNum = vals.checkNumber || '';
    const memoLine = vals.memo || '';
    const splitLns = (vals.splitLines || []).filter(l => Number(l.amount) > 0);

    const words = (() => {
      const dollars = Math.floor(amt);
      const cents = Math.round((amt - dollars) * 100);
      return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100`;
    })();

    // Dot-fill for written amount line
    const dotFill = words + ' ' + '*'.repeat(Math.max(0, 72 - words.length));

    // Remittance rows for stubs
    const stubDetailRows = splitLns.length > 0
      ? splitLns.map(l => `
          <tr>
            <td colspan="2" style="padding:2px 0; font-size:11px; color:#333;">${l.description || l.account || ''}</td>
            <td></td>
            <td style="padding:2px 0; font-size:11px; text-align:right; color:#333;">${Number(l.amount||0).toFixed(2)}</td>
          </tr>`).join('')
      : memoLine ? `<tr>
          <td colspan="2" style="padding:2px 0; font-size:11px; color:#333;">${memoLine}</td>
          <td></td>
          <td style="padding:2px 0; font-size:11px; text-align:right; color:#333;">${amtStr}</td>
        </tr>` : '';

    // Stub section — only dynamic data (payee, date, amounts, detail lines)
    const stub = () => `
      <div style="height:185px; padding:10px 28px 8px 28px; box-sizing:border-box; font-family:Arial,sans-serif; position:relative;">
        <table style="width:100%; border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="font-size:11px; color:#444; padding:0 0 2px 0; width:45%;">${payeeName}</td>
              <td style="width:20%;"></td>
              <td style="font-size:11px; text-align:center; padding:0 0 2px 0; width:18%;">${dateStr}</td>
              <td style="font-size:12px; font-weight:600; text-align:right; padding:0 0 2px 0; width:17%;">${amtStr}</td>
            </tr>
            ${stubDetailRows}
          </tbody>
        </table>
        <div style="position:absolute; bottom:8px; left:28px; right:28px; display:flex; justify-content:space-between;">
          <span style="font-size:10px; color:#555;">${memoLine}</span>
          <span style="font-size:11px; font-weight:600;">${amtStr}</span>
        </div>
      </div>`;

    /* ═══════════════════════════════════════════════════════════════════
       PRINT LAYOUT for preprinted check stock.
       Only dynamic data is printed. Everything preprinted on the check
       stock (company name, check number, MICR line, DATE label, DOLLARS
       text, signature line, horizontal lines) is NOT printed.
       Positions are absolute within a fixed check-body height to align
       with standard preprinted check stock.
       ═══════════════════════════════════════════════════════════════════ */
    return `<!doctype html><html><head><title>Check #${checkNum}</title>
    <style>
      @page { margin: 0.2in 0.35in; size: letter portrait; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
      .check-body { position: relative; height: 330px; }
      .check-content { position: relative; height: 100%; padding: 0 28px; }
      .stub-wrap { position: relative; border-top: 1px dashed #ccc; }
    </style></head><body>

      <!-- ═══════════════ CHECK BODY ═══════════════ -->
      <div class="check-body">
        <div class="check-content">

          <!-- Date value (positioned to align with preprinted DATE label) -->
          <div style="position:absolute; top:58px; right:28px;">
            <span style="font-size:12px; font-weight:600; min-width:100px; display:inline-block; text-align:center;">${dateStr}</span>
          </div>

          <!-- PAY TO payee name (positioned next to preprinted PAY TO THE ORDER OF) -->
          <div style="position:absolute; top:88px; left:120px; right:120px;">
            <span style="font-size:13px; font-weight:700;">${payeeName}</span>
          </div>

          <!-- Numeric amount (positioned in the preprinted amount box) -->
          <div style="position:absolute; top:84px; right:28px;">
            <span style="font-size:12px; font-weight:700;">**${amtStr}</span>
          </div>

          <!-- Written amount text (positioned on the preprinted amount line) -->
          <div style="position:absolute; top:116px; left:28px; right:70px;">
            <span style="font-size:12px; font-weight:600; letter-spacing:0.02em;">${dotFill}</span>
          </div>

          <!-- Payee address (positioned in the address window area) -->
          <div style="position:absolute; top:148px; left:32px; font-size:11px; line-height:1.6;">
            ${payeeName ? `<div style="font-weight:700;">${payeeName}</div>` : ''}
            ${payeeAddr ? payeeAddr.split('\n').map(l => `<div>${l}</div>`).join('') : ''}
          </div>

          <!-- Memo text (positioned next to preprinted MEMO label) -->
          <div style="position:absolute; bottom:26px; left:80px;">
            <span style="font-size:10px;">${memoLine}</span>
          </div>

        </div>
      </div>

      <!-- ═══════════════ STUB 1 ═══════════════ -->
      <div class="stub-wrap">
        ${stub()}
      </div>

      <!-- ═══════════════ STUB 2 ═══════════════ -->
      <div class="stub-wrap">
        ${stub()}
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
      // Validate split lines match check amount
      if (splitLines.length > 1 && Math.abs(splitTotal - totalAmt) > 0.005) {
        message.error(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not match the check amount (${cSym}${totalAmt.toFixed(2)}). Please correct before saving.`);
        setLoading(false);
        return;
      }
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

              {/* Row 1: Date | Bank Account | Check # */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <Form.Item name="date" label="Date" rules={[{ required: true }]} style={{ flex: '0 0 140px' }}>
                  <DatePicker style={{ width: '100%' }} onChange={(d) => setWatchDate(d)} />
                </Form.Item>
                <Form.Item name="accountId" label="Bank Account" rules={[{ required: true, message: 'Select bank account' }]} style={{ flex: 1 }}>
                  <Select showSearch optionFilterProp="children" placeholder="Select bank account" onChange={(v) => setWatchAccountId(v)}>
                    {bankAccounts.map(a => (
                      <Option key={a.id} value={a.id}>
                        {a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="checkNumber" label="Check #" rules={[{ required: true, message: 'Required' }]} validateStatus={isDuplicate ? 'warning' : undefined} help={isDuplicate ? 'Duplicate number' : undefined} style={{ flex: '0 0 100px' }}>
                  <Input placeholder={suggestedCheckNum} onChange={(e) => setWatchCheckNumber(e.target.value)} />
                </Form.Item>
              </div>

              {/* Row 2: Pay To (select) | Payee Name (text) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <Form.Item name="payee" label="Pay To" style={{ flex: 1 }}>
                  <Select showSearch optionFilterProp="children" placeholder="Select payee" allowClear onChange={(val, opt) => {
                    const name = opt?.children || '';
                    form.setFieldsValue({ payeeName: name });
                    setWatchPayeeName(name);
                    // Auto-fill vendor address
                    if (val && val.startsWith('v-')) {
                      const vendor = payees.find(p => p.id === val);
                      if (vendor && vendor._raw) {
                        const r = vendor._raw;
                        const addrParts = [r.address1, r.address2, [r.city, r.state].filter(Boolean).join(', '), r.postal_code].filter(Boolean);
                        form.setFieldsValue({ payeeAddress: addrParts.join('\n') });
                      }
                    }
                  }}>
                    {payees.map(p => (
                      <Option key={p.id} value={p.id}>{p.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="payeeName" label="Payee Name (override)" style={{ flex: 1 }}>
                  <Input placeholder="Or type payee name directly" onChange={(e) => setWatchPayeeName(e.target.value)} />
                </Form.Item>
              </div>

              {/* Row 3: Amount | Words */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <Form.Item name="amount" label="Amount ($)" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]} style={{ flex: '0 0 150px' }}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} formatter={v => v ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} onChange={(v) => setAmount(v || 0)} />
                </Form.Item>
                <Form.Item label="In Words" style={{ flex: 1 }}>
                  <Input value={amountWords} readOnly style={{ fontStyle: 'italic', background: '#f9f9f9' }} />
                </Form.Item>
              </div>
              {splitLines.length > 1 && Math.abs(splitTotal - (amount || 0)) > 0.005 && (
                <Alert message={`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not match the check amount (${cSym}${(amount || 0).toFixed(2)}). The amount will auto-update from split totals.`} type="warning" showIcon style={{ marginBottom: 8 }} />
              )}

              {/* Row 4: Payee Address | Memo */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <Form.Item name="payeeAddress" label="Payee Address" style={{ flex: 1 }}>
                  <TextArea rows={2} placeholder={"P.O. Box 399\nGratz Pa 17030"} style={{ fontFamily: 'inherit' }} />
                </Form.Item>
                <Form.Item name="memo" label="Memo" style={{ flex: 1 }}>
                  <TextArea rows={2} placeholder="What is this check for?" maxLength={200} showCount onChange={(e) => setWatchMemo(e.target.value)} />
                </Form.Item>
              </div>

              <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>Split Lines (Expense Accounts)</Divider>
              <div style={{ marginBottom: 12 }}>
                {/* Column headers */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                  <span style={{ flex: 2, fontSize: 11, color: '#888', fontWeight: 600 }}>Account</span>
                  <span style={{ flex: 2, fontSize: 11, color: '#888', fontWeight: 600 }}>Description</span>
                  <span style={{ flex: '0 0 100px', fontSize: 11, color: '#888', fontWeight: 600 }}>Amount</span>
                  <span style={{ flex: '0 0 28px' }}></span>
                </div>
                {splitLines.map((line) => (
                  <div key={line.key} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                    <div style={{ flex: 2 }}>
                      <Select size="small" placeholder="Account" value={line.account || undefined} onChange={v => updateSplitLine(line.key, 'account', v)} style={{ width: '100%' }} showSearch optionFilterProp="children" allowClear>
                        {accounts.map(a => <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>)}
                      </Select>
                    </div>
                    <div style={{ flex: 2 }}>
                      <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} />
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <InputNumber size="small" min={0} step={0.01} placeholder="0.00" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '0 0 28px' }}>
                      {splitLines.length > 1 && <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => removeSplitLine(line.key)} />}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Button size="small" type="dashed" onClick={addSplitLine} icon={<PlusOutlined />}>Add Line</Button>
                  {splitLines.length > 1 && <Text type="secondary" style={{ fontSize: 12 }}>Split Total: {cSym}{splitTotal.toFixed(2)}</Text>}
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
