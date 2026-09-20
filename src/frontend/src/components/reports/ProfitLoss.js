import React, { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Button, Table, Statistic, Row, Col, Space, Tag, Typography, Tooltip, Select, Radio, Checkbox, Modal, Alert, Spin, message, Progress } from 'antd';
import {
  PrinterOutlined, DownloadOutlined, SyncOutlined, CalendarOutlined, ArrowUpOutlined,
  ArrowDownOutlined, SwapOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined,
  AuditOutlined, ReloadOutlined, CaretDownOutlined, CaretRightOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { buildAccountTree, walkAccountTree, pruneZeroAccounts } from '../../utils/accounts';
import { buildDisplayRows, allGroupKeys } from '../../utils/reportHierarchy';
import { useHistory } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v, total) => total ? ((v / total) * 100).toFixed(1) + '%' : '0.0%';

// Source drill-down metadata (mirrors JournalEntries)
const SOURCE_ROUTES = {
  invoice:       id => `/main/customers/invoices/edit/${id}`,
  expense:       id => `/main/vendors/bills/edit/${id}`,
  bill_payment:  id => `/main/vendors/bills/edit/${id}`,
  payment:       () => '/main/customers/payments',
  deposit:       () => '/main/banking/deposits',
  transaction:   (id, src) => {
    if (src && src.kind === 'check') return '/main/accountant/check-printing';
    if (src && src.kind === 'bill' && src.id) return `/main/vendors/bills/edit/${src.id}`;
    return '/main/accountant/journal-entries';
  },
  check:         () => '/main/accountant/check-printing',
  transfer:      () => '/main/banking/transfers',
  credit_note:   () => '/main/customers/credit-notes',
  vendor_credit: () => '/main/vendors/credits',
  reversal:      () => '/main/accountant/journal-entries',
  payroll:       () => '/main/employees/payroll',
};

const SOURCE_LABELS = {
  invoice: 'Invoice', expense: 'Bill', bill_payment: 'Bill Payment', payment: 'Payment',
  deposit: 'Deposit', transaction: 'Transaction', check: 'Check', transfer: 'Transfer',
  credit_note: 'Credit Note', vendor_credit: 'Vendor Credit', reversal: 'Reversal', payroll: 'Payroll',
};

const SOURCE_COLORS = {
  invoice: 'blue', payment: 'green', expense: 'orange', bill: 'volcano',
  bill_payment: 'magenta', deposit: 'cyan', transaction: 'geekblue',
  check: 'purple', transfer: 'lime', payroll: 'gold', manual: 'default',
};

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'thisQuarter', label: 'This Quarter' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'lastYear', label: 'Last Year' },
];

const EMPTY_DATA = {
  income: [], cogs: [], expenses: [], byId: {},
  summary: { totalIncome: 0, totalCOGS: 0, grossProfit: 0, totalExpenses: 0, operatingProfit: 0, netIncome: 0 },
};

// ── Tree helpers are shared (utils/accounts.js) so the P&L and every other
// report build the parent→child hierarchy the same way, by account id. ──────
const buildSection = buildAccountTree;
const walk = walkAccountTree;
const pruneZeros = pruneZeroAccounts;
// buildDisplayRows / allGroupKeys (the QuickBooks-style group + "Total <Parent>"
// presentation) live in utils/reportHierarchy.js so they are pure, shared and
// unit-testable. They change PRESENTATION only — amounts come straight from the
// tree's amountDisplay (direct + descendants), so nothing is double-counted.

const ProfitLoss = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${fmt(v)}`;

  // Range + reporting options
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment().endOf('year')]);
  const [presetKey, setPresetKey] = useState('thisYear');
  const [basis, setBasis] = useState('accrual');
  const [hideZeros, setHideZeros] = useState(true);
  const [loc, setLoc] = useState(undefined);
  const [dept, setDept] = useState(undefined);
  const [cls, setCls] = useState(undefined);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Comparison
  const [showCompare, setShowCompare] = useState(false);
  const [compareMode, setCompareMode] = useState('previousPeriod');
  const [priorRangeText, setPriorRangeText] = useState('');
  const [priorLoading, setPriorLoading] = useState(false);
  const [budgetByDept, setBudgetByDept] = useState({});
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetPeriodText, setBudgetPeriodText] = useState('');

  // Data
  const [rawData, setRawData] = useState(EMPTY_DATA);
  const [priorRaw, setPriorRaw] = useState(null);

  // Drill-down modals
  const [activity, setActivity] = useState(null);
  const [sourceRecord, setSourceRecord] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const from = dateRange && dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : '';
  const to = dateRange && dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : '';

  const dims = [loc && `Loc: ${loc}`, cls && `Class: ${cls}`, dept && `Dept: ${dept}`].filter(Boolean).join(' · ');

  const reportOptions = () => {
    const o = { basis };
    if (loc) o.location = loc;
    if (cls) o.class = cls;
    if (dept) o.department = dept;
    return o;
  };

  const mapReport = (result) => {
    const profit = result?.profitLoss || {};
    const revenue = Number(profit.revenue || 0);
    const cogs = Number(profit.cogs || 0);
    const opex = Number(profit.operatingExpenses || 0);
    const gross = revenue - cogs;
    const net = Number(profit.netProfit != null ? profit.netProfit : (revenue - cogs - opex));
    const income = buildSection(profit.incomeAccounts);
    const cogsRows = buildSection(profit.cogsAccounts);
    const expenses = buildSection(profit.expenseAccounts);
    const byId = {};
    [income, cogsRows, expenses].forEach(rows => walk(rows, n => {
      byId[n.accountId] = { amount: n.amountDisplay, txn: n.txnCountDisplay, last: n.lastDateDisplay, name: n.name };
    }));
    return {
      income, cogs: cogsRows, expenses, byId,
      summary: { totalIncome: revenue, totalCOGS: cogs, grossProfit: gross, totalExpenses: opex, operatingProfit: gross - opex, netIncome: net },
    };
  };

  const loadReport = async () => {
    if (!from || !to) return;
    try {
      setLoading(true);
      const result = await window.electronAPI.getFinancialReport(from, to, reportOptions());
      setRawData(result && !result.error ? mapReport(result) : EMPTY_DATA);
    } catch (e) { console.error('P&L load error:', e); setRawData(EMPTY_DATA); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (dateRange && dateRange[0] && dateRange[1]) loadReport(); }, [dateRange, basis, loc, dept, cls]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.electronAPI.listLocations?.().then(r => setLocations(Array.isArray(r) ? r : [])).catch(() => {});
    window.electronAPI.listDepartments?.().then(r => setDepartments(Array.isArray(r) ? r : [])).catch(() => {});
    window.electronAPI.listClasses?.().then(r => setClasses(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const data = useMemo(() => ({
    income: pruneZeros(rawData.income, hideZeros),
    cogs: pruneZeros(rawData.cogs, hideZeros),
    expenses: pruneZeros(rawData.expenses, hideZeros),
    byId: rawData.byId,
    summary: rawData.summary,
  }), [rawData, hideZeros]);

  // Keep account hierarchy fully expanded on every report load (user can collapse)
  const [expandedKeys, setExpandedKeys] = useState([]);
  useEffect(() => {
    const collect = (rows, acc) => {
      rows.forEach(r => { if (r.children && r.children.length) { acc.push(r.key); collect(r.children, acc); } });
      return acc;
    };
    setExpandedKeys(collect([...data.income, ...data.cogs, ...data.expenses], []));
  }, [data.income, data.cogs, data.expenses]);

  // Flattened QuickBooks-style rows: group header → children → "Total <Parent>".
  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys]);
  const incomeRows = useMemo(() => buildDisplayRows(data.income, expandedSet), [data.income, expandedSet]);
  const cogsRows = useMemo(() => buildDisplayRows(data.cogs, expandedSet), [data.cogs, expandedSet]);
  const expenseRows = useMemo(() => buildDisplayRows(data.expenses, expandedSet), [data.expenses, expandedSet]);
  const toggleGroup = (key) => setExpandedKeys(k => (k.includes(key) ? k.filter(x => x !== key) : [...k, key]));

  const setPreset = (key) => {
    setPresetKey(key);
    const now = moment();
    switch (key) {
      case 'today': setDateRange([now.clone().startOf('day'), now.clone().endOf('day')]); break;
      case 'thisWeek': setDateRange([now.clone().startOf('week'), now.clone().endOf('week')]); break;
      case 'thisMonth': setDateRange([now.clone().startOf('month'), now.clone().endOf('month')]); break;
      case 'thisQuarter': setDateRange([now.clone().startOf('quarter'), now.clone().endOf('quarter')]); break;
      case 'thisYear': setDateRange([now.clone().startOf('year'), now.clone().endOf('year')]); break;
      case 'lastYear': setDateRange([now.clone().subtract(1, 'year').startOf('year'), now.clone().subtract(1, 'year').endOf('year')]); break;
      default: break;
    }
  };

  // ── Comparison ──────────────────────────────────────────────────────
  const loadComparison = async () => {
    if (!from || !to) return;
    let pFrom, pTo, label;
    if (compareMode === 'previousYear') {
      pFrom = moment(from).subtract(1, 'year');
      pTo = moment(to).subtract(1, 'year');
      label = `${pFrom.format('MM/DD/YYYY')} — ${pTo.format('MM/DD/YYYY')}`;
    } else {
      const durDays = moment(to).diff(moment(from), 'days');
      pTo = moment(from).subtract(1, 'day');
      pFrom = pTo.clone().subtract(durDays, 'days');
      label = `${pFrom.format('MM/DD/YYYY')} — ${pTo.format('MM/DD/YYYY')}`;
    }
    setPriorRangeText(label);
    setPriorLoading(true);
    try {
      const result = await window.electronAPI.getFinancialReport(pFrom.format('YYYY-MM-DD'), pTo.format('YYYY-MM-DD'), reportOptions());
      setPriorRaw(result && !result.error ? mapReport(result) : null);
    } catch { setPriorRaw(null); }
    setPriorLoading(false);
  };

  useEffect(() => {
    if (showCompare && dateRange && dateRange[0] && dateRange[1]) {
      if (compareMode === 'budget') loadBudget();
      else loadComparison();
    } else {
      setPriorRaw(null); setPriorRangeText(''); setBudgetByDept({}); setBudgetPeriodText('');
    }
  }, [showCompare, compareMode, dateRange, basis, loc, dept, cls]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBudget = async () => {
    if (!from || !to) return;
    setBudgetLoading(true);
    setBudgetPeriodText(`${from} — ${to}`);
    try {
      const budgets = await window.electronAPI.getBudgets?.();
      const list = Array.isArray(budgets) ? budgets : [];
      const months = new Set();
      const d = moment(from);
      while (d.format('YYYY-MM') <= moment(to).format('YYYY-MM')) { months.add(d.format('YYYY-MM')); d.add(1, 'month'); }
      const map = {};
      list.forEach(b => {
        if (months.has(String(b.period || '').slice(0, 7))) {
          const key = (b.department || '').toLowerCase();
          map[key] = (map[key] || 0) + Number(b.amount || 0);
        }
      });
      setBudgetByDept(map);
    } catch { setBudgetByDept({}); }
    setBudgetLoading(false);
  };

  const priorData = useMemo(() => (showCompare && compareMode !== 'budget' && priorRaw ? priorRaw : null), [showCompare, compareMode, priorRaw]);
  const priorLabel = compareMode === 'previousYear' ? 'Prev Year' : 'Prev Period';
  const ps = priorData?.summary;

  // ── Drill-down ──────────────────────────────────────────────────────
  const openAccountActivity = async (node) => {
    if (!node || !node.accountId) return;
    const ids = (node.descendantIds && node.descendantIds.length) ? node.descendantIds : [node.accountId];
    setActivity({ accountIds: ids, accountName: node.name, txns: [], loading: true });
    try {
      const lists = await Promise.all(ids.map(id =>
        window.electronAPI.getAccountActivity?.(id, { from: from || undefined, to: to || undefined, limit: 300 }) || []
      ));
      const txns = lists.flat()
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.journalId) - Number(a.journalId)));
      setActivity(a => ({ ...a, txns: Array.isArray(txns) ? txns : [], loading: false }));
    } catch {
      setActivity(a => ({ ...a, txns: [], loading: false }));
    }
  };

  const openSource = async (t) => {
    if (!t || !t.source_type) return;
    setSourceRecord(t);
    setSourceDetail(null);
    setSourceLoading(true);
    try {
      const detail = await window.electronAPI.journalSourceDetail?.(t.source_type, t.source_id);
      setSourceDetail(detail && !detail.error ? detail : null);
    } catch { setSourceDetail(null); }
    setSourceLoading(false);
  };

  // ── Variance + columns ──────────────────────────────────────────────
  const renderVariance = (cur, prior) => {
    if (prior == null) return null;
    const diff = cur - prior;
    const pctChange = prior !== 0 ? (diff / Math.abs(prior)) * 100 : (cur !== 0 ? 100 : 0);
    const isUp = diff > 0;
    return (
      <Tooltip title={`${isUp ? '+' : ''}${fmt(diff)} (${isUp ? '+' : ''}${pctChange.toFixed(1)}%)`}>
        <Tag color={isUp ? 'green' : diff < 0 ? 'red' : 'default'} style={{ marginLeft: 4, fontSize: 11 }}>
          {isUp ? <ArrowUpOutlined /> : diff < 0 ? <ArrowDownOutlined /> : null} {Math.abs(pctChange).toFixed(1)}%
        </Tag>
      </Tooltip>
    );
  };

  const sectionColumns = () => {
    const cols = [
      {
        title: 'Account', dataIndex: 'name', key: 'name', width: 340,
        render: (t, r) => {
          const info = r.txnCountDisplay > 0
            ? `${r.txnCountDisplay} transaction${r.txnCountDisplay !== 1 ? 's' : ''}${r.lastDateDisplay ? ` · Last ${moment(r.lastDateDisplay).format('MM/DD/YYYY')}` : ''}`
            : 'No transactions in period';
          const indent = 8 + (r.indent || 0) * 18;

          if (r.rowKind === 'subtotal') {
            return <span style={{ paddingLeft: indent, fontWeight: 600 }}>{t}</span>;
          }
          if (r.rowKind === 'group') {
            return (
              <span style={{ paddingLeft: 8 }}>
                <a onClick={(e) => { e.stopPropagation(); toggleGroup(r.key); }} style={{ cursor: 'pointer', marginRight: 6, color: '#595959' }}>
                  {r.expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                </a>
                <Tooltip title={`${info}. Click to view account activity.`}>
                  <a onClick={() => openAccountActivity(r)} style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 600 }}>
                    {r.number ? <Text type="secondary" style={{ marginRight: 6, fontSize: 12 }}>{r.number}</Text> : null}
                    {t}
                  </a>
                </Tooltip>
              </span>
            );
          }
          return (
            <Tooltip title={`${info}. Click to view account activity.`}>
              <a onClick={() => openAccountActivity(r)} style={{ cursor: 'pointer', color: '#1890ff', paddingLeft: indent, display: 'inline-block' }}>
                {r.number ? <Text type="secondary" style={{ marginRight: 6, fontSize: 12 }}>{r.number}</Text> : null}
                {t}
              </a>
            </Tooltip>
          );
        },
      },
      {
        title: 'Amount', dataIndex: 'amountDisplay', key: 'amount', align: 'right', width: 140,
        render: (v, r) => {
          // An OPEN group header carries no amount — its "Total <Parent>" row
          // (after the children) shows it instead. A COLLAPSED group keeps the
          // total on its single row so the value is never hidden.
          if (r.rowKind === 'group' && r.expanded) return null;
          const strong = r.rowKind === 'group' || r.rowKind === 'subtotal';
          return <Text style={{ fontWeight: strong ? 600 : 500 }}>{fmtC(v)}</Text>;
        },
      },
      {
        title: '% of Revenue', dataIndex: 'amountDisplay', key: 'pct', align: 'right', width: 110,
        render: (v, r) => (r.rowKind === 'group' && r.expanded)
          ? null
          : <Text type={r.rowKind === 'subtotal' ? undefined : 'secondary'} style={r.rowKind === 'subtotal' ? { fontWeight: 600 } : undefined}>{pct(v, data.summary.totalIncome)}</Text>,
      },
    ];
    if (priorData) {
      cols.push({
        title: priorLabel, key: 'prior', align: 'right', width: 140,
        render: (_, r) => {
          if (r.rowKind === 'group' && r.expanded) return null;
          const p = priorData.byId[r.accountId];
          return p ? <Text type="secondary">{fmtC(p.amount)}</Text> : <Text type="secondary">-</Text>;
        },
      });
      cols.push({
        title: 'Change', key: 'change', align: 'right', width: 170,
        render: (_, r) => {
          if (r.rowKind === 'group' && r.expanded) return null;
          const p = priorData.byId[r.accountId];
          return p ? renderVariance(r.amountDisplay, p.amount) : null;
        },
      });
    } else if (showCompare && compareMode === 'budget') {
      cols.push({
        title: 'Budget', key: 'budget', align: 'right', width: 140,
        render: (_, r) => {
          if (r.rowKind === 'group' && r.expanded) return null;
          const b = budgetByDept[String(r.budgetName || r.name || '').toLowerCase()];
          return b != null ? <Text type="secondary">{fmtC(b)}</Text> : <Text type="secondary">-</Text>;
        },
      });
      cols.push({
        title: 'Change', key: 'change', align: 'right', width: 170,
        render: (_, r) => {
          if (r.rowKind === 'group' && r.expanded) return null;
          const b = budgetByDept[String(r.budgetName || r.name || '').toLowerCase()];
          return b != null ? renderVariance(r.amountDisplay, b) : null;
        },
      });
    }
    return cols;
  };

  // ── Exports ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    const s = data.summary;
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rowsHtml = [];
    const add = (title, rowsArr, total) => {
      rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;border-top:2px solid #333">${esc(title)}</td><td style="border-top:2px solid #333"></td></tr>`);
      buildDisplayRows(rowsArr, new Set(allGroupKeys(rowsArr))).forEach(r => {
        const pad = 16 + (r.indent || 0) * 18;
        if (r.rowKind === 'group') {
          rowsHtml.push(`<tr><td style="padding:4px 8px;padding-left:${pad}px;font-weight:600;background:#fafafa">${esc(r.name)}</td><td style="background:#fafafa"></td></tr>`);
        } else if (r.rowKind === 'subtotal') {
          rowsHtml.push(`<tr><td style="padding:4px 8px;padding-left:${pad}px;font-weight:bold;border-top:1px solid #ccc">${esc(r.name)}</td><td style="text-align:right;padding:4px 8px;font-weight:bold;border-top:1px solid #ccc">${fmt(r.amountDisplay)}</td></tr>`);
        } else {
          rowsHtml.push(`<tr><td style="padding:4px 8px;padding-left:${pad}px">${esc(r.name)}</td><td style="text-align:right;padding:4px 8px">${fmt(r.amountDisplay)}</td></tr>`);
        }
      });
      rowsHtml.push(`<tr><td style="padding:4px 8px;font-weight:bold;border-bottom:1px solid #ccc">${esc(title)} Total</td><td style="text-align:right;padding:4px 8px;font-weight:bold;border-bottom:1px solid #ccc">${fmt(total)}</td></tr>`);
    };
    add('REVENUE', data.income, s.totalIncome);
    add('COST OF GOODS SOLD', data.cogs, s.totalCOGS);
    rowsHtml.push(`<tr><td style="padding:4px 8px;font-weight:bold">GROSS PROFIT</td><td style="text-align:right;padding:4px 8px;font-weight:bold">${fmt(s.grossProfit)}</td></tr>`);
    add('OPERATING EXPENSES', data.expenses, s.totalExpenses);
    rowsHtml.push(`<tr><td style="padding:6px 8px;font-weight:bold;border-top:2px solid #333">NET INCOME</td><td style="text-align:right;padding:6px 8px;font-weight:bold;border-top:2px solid #333">${fmt(s.netIncome)}</td></tr>`);
    const html = `<!doctype html><html><head><title>Profit & Loss</title><style>body{font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eee}tr{page-break-inside:avoid}tr:last-child td{border-bottom:2px solid #333;font-weight:bold}</style></head><body><h2>Profit & Loss Statement</h2><p>${from} — ${to} · ${basis === 'cash' ? 'Cash' : 'Accrual'} basis${dims ? ' · ' + esc(dims) : ''}</p><table>${rowsHtml.join('')}</table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    const s = data.summary;
    const lines = [['Section', 'Account', 'Amount', '% of Revenue'].join(',')];
    const add = (sec, rowsArr, total) => {
      buildDisplayRows(rowsArr, new Set(allGroupKeys(rowsArr))).forEach(r => {
        const amount = r.rowKind === 'group' ? '' : r.amountDisplay;
        lines.push([sec, `${'  '.repeat(r.indent)}${r.name}`, amount, amount === '' ? '' : pct(amount, s.totalIncome)].join(','));
      });
      lines.push([sec, `${sec} Total`, total, pct(total, s.totalIncome)].join(','));
    };
    add('Income', data.income, s.totalIncome);
    add('COGS', data.cogs, s.totalCOGS);
    lines.push(['', 'GROSS PROFIT', s.grossProfit, pct(s.grossProfit, s.totalIncome)].join(','));
    add('Expenses', data.expenses, s.totalExpenses);
    lines.push(['', 'NET INCOME', s.netIncome, pct(s.netIncome, s.totalIncome)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `profit-loss-${from}-${to}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    try {
      const s = data.summary;
      const rows = [];
      const push = (sec, rowsArr, total) => {
        buildDisplayRows(rowsArr, new Set(allGroupKeys(rowsArr))).forEach(r => {
          const amount = r.rowKind === 'group' ? '' : r.amountDisplay;
          rows.push({ Section: sec, Account: `${'  '.repeat(r.indent)}${r.name}`, Amount: amount, '% of Revenue': amount === '' ? '' : (s.totalIncome ? Number(((amount / s.totalIncome) * 100).toFixed(1)) : 0) });
        });
        rows.push({ Section: sec, Account: `${sec} Total`, Amount: total, '% of Revenue': s.totalIncome ? Number(((total / s.totalIncome) * 100).toFixed(1)) : 0 });
      };
      push('Income', data.income, s.totalIncome);
      push('COGS', data.cogs, s.totalCOGS);
      rows.push({ Section: '', Account: 'GROSS PROFIT', Amount: s.grossProfit, '% of Revenue': s.totalIncome ? Number(((s.grossProfit / s.totalIncome) * 100).toFixed(1)) : 0 });
      push('Expenses', data.expenses, s.totalExpenses);
      rows.push({ Section: '', Account: 'NET INCOME', Amount: s.netIncome, '% of Revenue': s.totalIncome ? Number(((s.netIncome / s.totalIncome) * 100).toFixed(1)) : 0 });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'P&L');
      XLSX.writeFile(wb, `profit-loss-${from}-${to}.xlsx`);
    } catch (e) { console.error(e); message.error('Excel export failed'); }
  };

  const handleExportPDF = () => {
    try {
      const s = data.summary;
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Profit & Loss Statement', 14, 16);
      doc.setFontSize(9);
      doc.text(`${from} — ${to}  ·  ${basis === 'cash' ? 'Cash' : 'Accrual'} basis${dims ? '  ·  ' + dims : ''}`, 14, 23);
      const body = [];
      const push = (title, rowsArr, total) => {
        body.push([{ content: title, styles: { fontStyle: 'bold' } }, '']);
        buildDisplayRows(rowsArr, new Set(allGroupKeys(rowsArr))).forEach(r => {
          const pad = '  '.repeat(r.indent || 0);
          if (r.rowKind === 'group') {
            body.push([{ content: `${pad}${r.name}`, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } }, { content: '', styles: { fillColor: [250, 250, 250] } }]);
          } else if (r.rowKind === 'subtotal') {
            body.push([{ content: `${pad}${r.name}`, styles: { fontStyle: 'bold' } }, { content: fmtC(r.amountDisplay), styles: { fontStyle: 'bold' } }]);
          } else {
            body.push([`${pad}${r.name}`, fmtC(r.amountDisplay)]);
          }
        });
        body.push([{ content: `${title} Total`, styles: { fontStyle: 'bold' } }, { content: fmtC(total), styles: { fontStyle: 'bold' } }]);
      };
      push('REVENUE', data.income, s.totalIncome);
      push('COST OF GOODS SOLD', data.cogs, s.totalCOGS);
      body.push([{ content: 'GROSS PROFIT', styles: { fontStyle: 'bold', fillColor: [230, 247, 255] } }, { content: fmtC(s.grossProfit), styles: { fontStyle: 'bold', fillColor: [230, 247, 255] } }]);
      push('OPERATING EXPENSES', data.expenses, s.totalExpenses);
      body.push([{ content: 'NET INCOME', styles: { fontStyle: 'bold', fillColor: s.netIncome >= 0 ? [246, 255, 237] : [255, 242, 240] } }, { content: fmtC(s.netIncome), styles: { fontStyle: 'bold', fillColor: s.netIncome >= 0 ? [246, 255, 237] : [255, 242, 240] } }]);
      doc.autoTable({
        startY: 28, head: [['Account', 'Amount']], body, theme: 'grid', styles: { fontSize: 9 },
        headStyles: { fillColor: [51, 51, 51] }, columnStyles: { 1: { halign: 'right' } },
        // Keep a group header, its children and its Total row on the same page
        // where possible.
        rowPageBreak: 'avoid',
      });
      doc.save(`profit-loss-${from}-${to}.pdf`);
    } catch (e) { console.error(e); message.error('PDF export failed'); }
  };

  const s = data.summary;
  const profitMargin = s.totalIncome > 0 ? (s.netIncome / s.totalIncome * 100) : 0;
  const grossMargin = s.totalIncome > 0 ? (s.grossProfit / s.totalIncome * 100) : 0;

  const summaryCell = (label, val, pctVal, extra) => (
    <>
      <Table.Summary.Cell><Text strong>{label}</Text></Table.Summary.Cell>
      <Table.Summary.Cell align="right"><Text strong>{fmtC(val)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell align="right"><Text strong type="secondary">{pctVal}</Text></Table.Summary.Cell>
      {priorData && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmtC(ps?.[extra] ?? 0)}</Text></Table.Summary.Cell>}
      {priorData && <Table.Summary.Cell align="right">{ps ? renderVariance(val, ps[extra]) : null}</Table.Summary.Cell>}
    </>
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Profit & Loss Statement</Title>
          <Text type="secondary">{from} — {to} · {basis === 'cash' ? 'Cash' : 'Accrual'} basis{dims ? ` · ${dims}` : ''}</Text>
        </div>
        <Space wrap>
          <Select value={presetKey} onChange={setPreset} style={{ width: 130 }} suffixIcon={<CalendarOutlined />}>
            {PRESETS.map(p => <Option key={p.key} value={p.key}>{p.label}</Option>)}
            <Option value="custom">Custom</Option>
          </Select>
          <RangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPresetKey('custom'); }} />
          <Button icon={<SwapOutlined />} onClick={() => setShowCompare(!showCompare)}>{showCompare ? 'Hide Compare' : 'Compare'}</Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExportXLSX}>Excel</Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPDF}>PDF</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>CSV</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadReport} />
        </Space>
      </div>

      {/* Reporting options */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[20, 12]}>
          <span>
            <Text strong style={{ fontSize: 12, marginRight: 8 }}>Basis:</Text>
            <Radio.Group value={basis} onChange={e => setBasis(e.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="accrual">Accrual</Radio.Button>
              <Radio.Button value="cash">Cash</Radio.Button>
            </Radio.Group>
          </span>
          <span>
            <Text strong style={{ fontSize: 12, marginRight: 8 }}>Location:</Text>
            <Select allowClear placeholder="All locations" value={loc} onChange={setLoc} style={{ width: 150 }} size="small">
              {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
            </Select>
          </span>
          <span>
            <Text strong style={{ fontSize: 12, marginRight: 8 }}>Class:</Text>
            <Select allowClear placeholder="All classes" value={cls} onChange={setCls} style={{ width: 150 }} size="small">
              {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
            </Select>
          </span>
          <span>
            <Text strong style={{ fontSize: 12, marginRight: 8 }}>Department:</Text>
            <Select allowClear placeholder="All departments" value={dept} onChange={setDept} style={{ width: 150 }} size="small">
              {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
            </Select>
          </span>
          <Checkbox checked={hideZeros} onChange={e => setHideZeros(e.target.checked)}>Hide zero-activity accounts</Checkbox>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadReport}>Refresh</Button>
        </Space>
      </Card>

      {/* Comparison card */}
      {showCompare && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap size={[16, 12]}>
            <Text strong style={{ fontSize: 12 }}>Compare to:</Text>
            <Radio.Group value={compareMode} onChange={e => setCompareMode(e.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="previousPeriod">Previous Period</Radio.Button>
              <Radio.Button value="previousYear">Previous Year</Radio.Button>
              <Radio.Button value="budget">Budget</Radio.Button>
            </Radio.Group>
            {compareMode === 'budget'
              ? <span>
                  <Text type="secondary">{budgetPeriodText}</Text>
                  {budgetLoading && <Spin size="small" style={{ marginLeft: 8 }} />}
                </span>
              : <span>
                  <Text type="secondary">{priorRangeText}</Text>
                  {priorLoading && <Spin size="small" style={{ marginLeft: 8 }} />}
                </span>}
          </Space>
        </Card>
      )}

      {/* Summary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Revenue" value={s.totalIncome} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
            {ps && renderVariance(s.totalIncome, ps.totalIncome)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Gross Profit" value={s.grossProfit} precision={2} prefix={cSym} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Margin: {grossMargin.toFixed(1)}%</Text>
            {ps && renderVariance(s.grossProfit, ps.grossProfit)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Total Expenses" value={s.totalExpenses} precision={2} prefix={cSym} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} />
            {ps && renderVariance(s.totalExpenses, ps.totalExpenses)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: s.netIncome >= 0 ? '3px solid #52c41a' : '3px solid #ff4d4f' }}>
            <Statistic title="Net Income" value={s.netIncome} precision={2} prefix={cSym} valueStyle={{ color: s.netIncome >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Margin: {profitMargin.toFixed(1)}%</Text>
            {ps && renderVariance(s.netIncome, ps.netIncome)}
          </Card>
        </Col>
      </Row>

      {/* Margin Bars */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Gross Margin</Text>
            <Progress percent={Math.min(Math.abs(grossMargin), 100)} status={grossMargin >= 0 ? 'active' : 'exception'} format={() => `${grossMargin.toFixed(1)}%`} strokeColor={grossMargin >= 40 ? '#52c41a' : grossMargin >= 20 ? '#faad14' : '#ff4d4f'} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Net Profit Margin</Text>
            <Progress percent={Math.min(Math.abs(profitMargin), 100)} status={profitMargin >= 0 ? 'active' : 'exception'} format={() => `${profitMargin.toFixed(1)}%`} strokeColor={profitMargin >= 20 ? '#52c41a' : profitMargin >= 10 ? '#faad14' : '#ff4d4f'} />
          </Card>
        </Col>
      </Row>

      {/* Income Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Revenue / Income</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns()} dataSource={incomeRows} rowKey="key" loading={loading} pagination={false} size="small"
          rowClassName={(r) => r.rowKind === 'group' ? 'pl-group-row' : r.rowKind === 'subtotal' ? 'pl-subtotal-row' : ''}
          summary={() => (
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              {summaryCell('Total Revenue', s.totalIncome, '100.0%', 'totalIncome')}
            </Table.Summary.Row>
          )} />
      </Card>

      {/* COGS Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Cost of Goods Sold</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns()} dataSource={cogsRows} rowKey="key" loading={loading} pagination={false} size="small"
          rowClassName={(r) => r.rowKind === 'group' ? 'pl-group-row' : r.rowKind === 'subtotal' ? 'pl-subtotal-row' : ''}
          summary={() => (
            <>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                {summaryCell('Total COGS', s.totalCOGS, pct(s.totalCOGS, s.totalIncome), 'totalCOGS')}
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: '#e6f7ff' }}>
                <Table.Summary.Cell><Text strong style={{ color: '#1890ff' }}>GROSS PROFIT</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmtC(s.grossProfit)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{pct(s.grossProfit, s.totalIncome)}</Text></Table.Summary.Cell>
                {priorData && <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmtC(ps?.grossProfit ?? 0)}</Text></Table.Summary.Cell>}
                {priorData && <Table.Summary.Cell align="right">{ps ? renderVariance(s.grossProfit, ps.grossProfit) : null}</Table.Summary.Cell>}
              </Table.Summary.Row>
            </>
          )} />
      </Card>

      {/* Operating Expenses Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Operating Expenses</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns()} dataSource={expenseRows} rowKey="key" loading={loading} pagination={false} size="small"
          rowClassName={(r) => r.rowKind === 'group' ? 'pl-group-row' : r.rowKind === 'subtotal' ? 'pl-subtotal-row' : ''}
          summary={() => (
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              {summaryCell('Total Operating Expenses', s.totalExpenses, pct(s.totalExpenses, s.totalIncome), 'totalExpenses')}
            </Table.Summary.Row>
          )} />
      </Card>

      {/* Net Income Summary */}
      <Card style={{ background: s.netIncome >= 0 ? '#f6ffed' : '#fff2f0', border: s.netIncome >= 0 ? '1px solid #b7eb8f' : '1px solid #ffa39e' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: 0, color: s.netIncome >= 0 ? '#52c41a' : '#ff4d4f' }}>
              NET INCOME: {fmtC(s.netIncome)}
            </Title>
            <Text type="secondary">Net Profit Margin: {profitMargin.toFixed(1)}% &middot; Gross Margin: {grossMargin.toFixed(1)}%</Text>
          </Col>
          {ps && (
            <Col>
              <Text type="secondary">{priorLabel}: {fmtC(ps.netIncome)}</Text>
              {renderVariance(s.netIncome, ps.netIncome)}
            </Col>
          )}
        </Row>
      </Card>

      {/* ═══ ACCOUNT ACTIVITY MODAL (drill-down from a report line) ═══ */}
      <Modal
        title={activity ? (
          <span>
            <AuditOutlined style={{ marginRight: 8 }} />
            <span style={{ fontWeight: 600 }}>Account Activity — {activity.accountName}</span>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{from} → {to}</Text>
          </span>
        ) : 'Account Activity'}
        visible={!!activity}
        onCancel={() => setActivity(null)}
        footer={[
          <Button key="coa" onClick={() => history.push('/main/accountant/chart-of-accounts')} style={{ borderRadius: 6 }}>
            Open Chart of Accounts
          </Button>,
          <Button key="close" type="primary" onClick={() => setActivity(null)} style={{ borderRadius: 6 }}>Close</Button>,
        ]}
        width={920}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {activity && activity.loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading account activity..." /></div>
        ) : activity && activity.txns.length ? (
          <Table
            columns={[
              { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Journal #', dataIndex: 'journalId', key: 'journalId', width: 90, render: v => <Text code>{v}</Text> },
              { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true, render: v => v || <Text type="secondary">-</Text> },
              { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v, r) => <span>{r.lineDesc || v || '-'}</span> },
              { title: 'Source', key: 'source', width: 130,
                render: (_, t) => t.source_type
                  ? <Tag color={SOURCE_COLORS[t.source_type] || 'default'} style={{ borderRadius: 4 }}>{SOURCE_LABELS[t.source_type] || t.source_type}</Tag>
                  : <Text type="secondary">Manual</Text> },
              { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 120, align: 'right',
                render: v => Number(v) > 0 ? <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
              { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 120, align: 'right',
                render: v => Number(v) > 0 ? <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
            ]}
            dataSource={activity.txns.map((t, i) => ({ ...t, key: i }))}
            size="small" pagination={{ defaultPageSize: 15, showTotal: t => `${t} transactions` }}
            onRow={(t) => ({ onClick: () => { if (t.source_type) openSource(t); }, style: { cursor: t.source_type ? 'pointer' : 'default' } })}
          />
        ) : (
          <Alert type="info" showIcon message="No journal activity found for this account." />
        )}
      </Modal>

      {/* ═══ SOURCE TRANSACTION DETAIL MODAL ═══ */}
      <Modal
        title={
          sourceRecord ? (
            <span>
              <Tag color={SOURCE_COLORS[sourceRecord.source_type] || 'default'} style={{ borderRadius: 4 }}>{sourceDetail?.label || SOURCE_LABELS[sourceRecord.source_type] || sourceRecord.source_type}</Tag>
              <span style={{ fontWeight: 600 }}>{sourceDetail?.number ? `${sourceDetail.number} ` : ''}</span>
              <Text type="secondary" style={{ fontSize: 13 }}>source transaction</Text>
            </span>
          ) : 'Source Transaction'
        }
        visible={!!sourceRecord}
        onCancel={() => setSourceRecord(null)}
        footer={[
          <Button key="close" onClick={() => setSourceRecord(null)} style={{ borderRadius: 6 }}>Close</Button>,
          sourceRecord && SOURCE_ROUTES[sourceRecord.source_type]
            ? <Button key="open" type="primary" icon={<FileTextOutlined />} style={{ borderRadius: 6 }}
                onClick={() => history.push(SOURCE_ROUTES[sourceRecord.source_type](sourceRecord.source_id, sourceDetail || {}))}>
                Open Original
              </Button>
            : null,
        ]}
        width={820}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {sourceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading source transaction..." /></div>
        ) : sourceDetail ? (
          <div>
            <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 11 }}>{sourceDetail.partyLabel || 'Party'}</Text>
                {sourceDetail.partyType && sourceDetail.partyId ? (
                  <div style={{ fontWeight: 600 }}>
                    <a style={{ cursor: 'pointer', color: '#1890ff' }}
                      onClick={() => history.push(sourceDetail.partyType === 'customer'
                        ? `/main/customers/details/${sourceDetail.partyId}`
                        : `/main/vendors/details/${sourceDetail.partyId}`)}
                      title={`Open ${sourceDetail.partyLabel || 'party'} profile`}>
                      {sourceDetail.party || '—'}
                    </a>
                  </div>
                ) : <div style={{ fontWeight: 600 }}>{sourceDetail.party || '—'}</div>}
              </Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Date</Text><div style={{ fontWeight: 600 }}>{sourceDetail.date ? moment(sourceDetail.date).format('MM/DD/YYYY') : '—'}</div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Status</Text><div><Tag color={String(sourceDetail.status || '').toLowerCase().includes('paid') || String(sourceDetail.status || '').toLowerCase().includes('deposit') ? 'success' : 'default'} style={{ borderRadius: 4 }}>{sourceDetail.status || '—'}</Tag></div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Total</Text><div style={{ fontWeight: 700, color: '#cf1322' }}>{fmtC(sourceDetail.total)}</div></Col>
            </Row>
            {sourceDetail.memo ? (
              <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                message={<span><Text strong>Memo / Notes: </Text>{sourceDetail.memo}</span>} />
            ) : null}
            <Table
              columns={[
                { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                { title: 'Account', dataIndex: 'account', key: 'account', width: 180, ellipsis: true, render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
                { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'right', render: v => (v != null && v !== '' && Number(v) !== 1) ? Number(v) : <Text type="secondary">1</Text> },
                { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 110, align: 'right', render: v => fmtC(v) },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{fmtC(v)}</Text> },
              ]}
              dataSource={(sourceDetail.lines || []).map((l, i) => ({ ...l, key: i }))}
              size="small" pagination={false} bordered
              summary={() => (
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(sourceDetail.total)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        ) : (
          <Alert type="warning" showIcon message="Could not load the source transaction details." />
        )}
      </Modal>

      {/* QuickBooks-style hierarchy: a subtle group header and a clear rule on
          each "Total <Parent>" row. Presentation only — no money changes. */}
      <style>{`
        .pl-group-row > td { background: #fafafa !important; }
        .pl-subtotal-row > td { border-top: 1px solid #d9d9d9 !important; }
      `}</style>
    </div>
  );
};

export default ProfitLoss;
