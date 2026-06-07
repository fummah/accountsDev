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
    const micrCheck   = checkNum   ? `${checkNum}\u2468`   : '';
    const micrLine    = `${micrRouting} ${micrAccount} ${micrCheck}`;

    // Routing fraction display (e.g. 60-1177/313)
    const routingDisplay = routingNum ? routingNum : '';

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

    // Stub section — matches image exactly:
    // Row 1: payer name (bold, left) | blank | date (center) | check# (right)
    // Row 2: payee name (left)       | blank | blank          | amount (right)
    // detail rows, then memo bottom-left / amount bottom-right
    const stub = () => `
      <div style="height:185px; padding:10px 28px 8px 28px; box-sizing:border-box; border-top:1px dashed #aaa; font-family:Arial,sans-serif;">
        <table style="width:100%; border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="font-size:12px; font-weight:700; padding:0 0 2px 0; width:45%;">${coName}</td>
              <td style="width:20%;"></td>
              <td style="font-size:11px; text-align:center; padding:0 0 2px 0; width:18%;">${dateStr}</td>
              <td style="font-size:13px; font-weight:700; text-align:right; padding:0 0 2px 0; width:17%;">${checkNum}</td>
            </tr>
            <tr>
              <td style="font-size:11px; color:#444; padding:0 0 6px 0;">${payeeName}</td>
              <td></td>
              <td></td>
              <td style="font-size:12px; font-weight:600; text-align:right; padding:0 0 6px 0;">${amtStr}</td>
            </tr>
            ${stubDetailRows}
          </tbody>
        </table>
        <div style="position:absolute; bottom:8px; left:28px; right:28px; display:flex; justify-content:space-between;">
          <span style="font-size:10px; color:#555;">${memoLine}</span>
          <span style="font-size:11px; font-weight:600;">${amtStr}</span>
        </div>
      </div>`;

    // Security background SVG (light blue diagonal lines pattern, like safety paper)
    const secBg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect width='60' height='60' fill='%23e8f4fd'/><line x1='0' y1='0' x2='60' y2='60' stroke='%23b8d9f0' stroke-width='0.5' opacity='0.6'/><line x1='0' y1='20' x2='40' y2='60' stroke='%23b8d9f0' stroke-width='0.5' opacity='0.6'/><line x1='20' y1='0' x2='60' y2='40' stroke='%23b8d9f0' stroke-width='0.5' opacity='0.6'/><line x1='0' y1='40' x2='20' y2='60' stroke='%23b8d9f0' stroke-width='0.5' opacity='0.4'/><line x1='40' y1='0' x2='60' y2='20' stroke='%23b8d9f0' stroke-width='0.5' opacity='0.4'/></svg>`;

    return `<!doctype html><html><head><title>Check #${checkNum}</title>
    <style>
      @page { margin: 0.2in 0.35in; size: letter portrait; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
      .check-body { position: relative; }
      .check-bg {
        position: absolute; inset: 0;
        background-image: url("${secBg}");
        background-repeat: repeat;
        opacity: 1;
        z-index: 0;
      }
      .check-content { position: relative; z-index: 1; }
      .micr { font-family: 'MICR Encoding', 'Courier New', monospace; font-size: 13px; letter-spacing: 2px; }
      .stub-wrap { position: relative; }
    </style></head><body>

      <!-- ═══════════════ CHECK BODY (top third) ═══════════════ -->
      <div class="check-body" style="height:330px; border-bottom:1px solid #999;">
        <div class="check-bg"></div>
        <div class="check-content" style="padding:12px 28px 0 28px; height:100%;">

          <!-- Header row: company left | bank+routing center | check# right -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <div style="font-size:11px; line-height:1.55; min-width:170px;">
              ${coName  ? `<div style="font-weight:700; font-size:13px;">${coName}</div>` : ''}
              ${coAddr  ? `<div>${coAddr}</div>` : ''}
              ${coCity  ? `<div>${coCity}</div>` : ''}
              ${coPhone ? `<div>${coPhone}</div>` : ''}
            </div>
            <div style="text-align:center; flex:1; padding:0 10px; font-size:11px;">
              ${bankName ? `<div style="font-weight:700; font-size:12px;">${bankName}</div>` : ''}
              ${routingDisplay ? `<div style="font-size:10px; color:#555;">${routingDisplay}</div>` : ''}
            </div>
            <div style="text-align:right; min-width:70px;">
              <div style="font-size:20px; font-weight:700; letter-spacing:1px;">${checkNum}</div>
            </div>
          </div>

          <!-- Date row -->
          <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:8px;">
            <span style="font-size:10px; margin-right:5px; color:#555;">DATE</span>
            <span style="font-size:12px; font-weight:600; border-bottom:1px solid #333; min-width:100px; text-align:center; padding-bottom:1px;">${dateStr}</span>
          </div>

          <!-- PAY TO THE ORDER OF -->
          <div style="display:flex; align-items:center; margin-bottom:5px; gap:6px;">
            <span style="font-size:9px; font-weight:700; white-space:nowrap; line-height:1.3;">PAY TO THE<br>ORDER OF</span>
            <span style="font-size:13px; font-weight:700; flex:1; border-bottom:1px solid #333; padding:0 4px 2px 4px; min-height:20px;">${payeeName}</span>
            <span style="font-size:11px; font-weight:700; border:1.5px solid #333; padding:2px 8px; white-space:nowrap; background:#fff;">$ **${amtStr}</span>
          </div>

          <!-- Written amount + DOLLARS -->
          <div style="display:flex; align-items:stretch; margin-bottom:10px; gap:0;">
            <span style="font-size:12px; font-weight:600; flex:1; border-bottom:1px solid #333; padding-bottom:2px; overflow:hidden; white-space:nowrap; letter-spacing:0.02em;">${dotFill}</span>
            <span style="font-size:9px; font-weight:700; writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); border:1px solid #aaa; padding:2px 1px; margin-left:4px; background:#fff; color:#333; letter-spacing:1px;">DOLLARS</span>
          </div>

          <!-- Payee address window -->
          <div style="font-size:11px; line-height:1.8; min-height:54px; padding-left:4px;">
            ${payeeName ? `<div style="font-weight:700;">${payeeName}</div>` : ''}
            ${payeeAddr ? payeeAddr.split('\n').map(l => `<div>${l}</div>`).join('') : ''}
          </div>

          <!-- Memo + Authorized Signature -->
          <div style="display:flex; justify-content:space-between; align-items:flex-end; position:absolute; bottom:26px; left:28px; right:28px;">
            <div style="font-size:10px;">
              <span style="font-weight:700;">MEMO </span>
              <span style="border-bottom:1px solid #333; display:inline-block; min-width:150px; padding-bottom:1px;">${memoLine}</span>
            </div>
            <div style="font-size:9px; text-align:center; min-width:170px;">
              <div style="border-top:1px solid #333; padding-top:2px; letter-spacing:0.5px;">AUTHORIZED SIGNATURE</div>
            </div>
          </div>

          <!-- MICR line -->
          <div class="micr" style="position:absolute; bottom:4px; left:28px; right:28px; text-align:center; color:#1a1a1a; font-size:13px;">
            ${micrLine}
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
                  <Select showSearch optionFilterProp="children" placeholder="Select payee" allowClear onChange={(val, opt) => { const name = opt?.children || ''; form.setFieldsValue({ payeeName: name }); setWatchPayeeName(name); }}>
                    {payees.map(p => (
                      <Option key={p.id} value={p.id}>{p.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="payeeName" label="Payee Name (override)" style={{ flex: 1 }}>
                  <Input placeholder="Or type payee name directly" onChange={(e) => setWatchPayeeName(e.target.value)} />
                </Form.Item>
              </div>

              {/* Row 3: Amount | Words | Routing | Acct */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <Form.Item name="amount" label="Amount ($)" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]} style={{ flex: '0 0 120px' }}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} formatter={v => v ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} onChange={(v) => setAmount(v || 0)} />
                </Form.Item>
                <Form.Item label="In Words" style={{ flex: 1 }}>
                  <Input value={amountWords} readOnly style={{ fontStyle: 'italic', background: '#f9f9f9' }} />
                </Form.Item>
                <Form.Item name="routingNumber" label="Routing #" style={{ flex: '0 0 110px' }}>
                  <Input placeholder="MICR routing" maxLength={9} />
                </Form.Item>
                <Form.Item name="accountNumber" label="Acct #" style={{ flex: '0 0 110px' }}>
                  <Input placeholder="MICR acct" />
                </Form.Item>
              </div>

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
