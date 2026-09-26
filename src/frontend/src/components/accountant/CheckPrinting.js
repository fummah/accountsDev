import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import { Card, Form, Input, InputNumber, DatePicker, Select, Button, Row, Col, message, Table, Tag, Space, Typography, Alert, Tooltip, Modal, Statistic, Spin } from 'antd';
import { PrinterOutlined, SaveOutlined, EyeOutlined, HistoryOutlined, DeleteOutlined, SearchOutlined, DollarOutlined, BankOutlined, WarningOutlined, CheckCircleOutlined, PlusOutlined, PaperClipOutlined, EditOutlined, BookOutlined, UnorderedListOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { dedupeAccounts, getBankAccounts, isBillLineAccount, isBankAccount } from '../../utils/accounts';
import AccountSelect from '../shared/AccountSelect';
import JournalEntryDetailModal from './JournalEntryDetailModal';
import { FormSection, FormGrid, FormCol, DocumentActionBar, FORM_ITEM_STYLE } from '../shared/FormSection';
import AttachmentManager from '../shared/AttachmentManager';

const { Option } = Select;
const { Title, Text } = Typography;
const { TextArea } = Input;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Money-safe helpers: sum in integer cents so financial totals never drift
// from floating-point addition (e.g. 0.1 + 0.2).
const toCents = (v) => Math.round((Number(v) || 0) * 100);
const sumMoney = (values) => values.reduce((cents, v) => cents + toCents(v), 0) / 100;

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

// Format a payee's stored address into clean display lines for the form and
// the printed envelope window. Handles vendors/customers (address1/address2/
// city/state/postal_code/country) and employees (single address field).
// Never emits undefined/null, blank lines, extra commas, or double spaces.
const formatPayeeAddress = (p) => {
  const r = p && p._raw ? p._raw : (p || {});
  const clean = (v) => (v == null ? '' : String(v).trim().replace(/\s+/g, ' '));
  const cityState = [clean(r.city), clean(r.state)].filter(Boolean).join(', ');
  const cityStateZip = [cityState, clean(r.postal_code)].filter(Boolean).join(' ');
  const lines = [clean(r.address1), clean(r.address2), cityStateZip, clean(r.country)];
  if (!lines.some(Boolean)) {
    const single = clean(r.address);
    return single ? single : '';
  }
  return lines.filter(Boolean).join('\n');
};

const CheckPrinting = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const formRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  // Split-line allocation accounts: what the cheque is being paid FOR — i.e.
  // everything a payment can be posted AGAINST (Expense, Asset, Liability,
  // Loan, Equity, …) EXCEPT the Bank accounts. The source of funds is chosen
  // separately in the Bank Account field above, so a Bank account must never be
  // offered here. Eligibility comes from the shared isBillLineAccount rule
  // (type/subtype based, never by name); Bank is then removed.
  const splitAccounts = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).filter(a => isBillLineAccount(a) && !isBankAccount(a)),
    [accounts]
  );
  const [payees, setPayees] = useState([]);
  const [checkHistory, setCheckHistory] = useState([]);
  const [journalDetailId, setJournalDetailId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [company, setCompany] = useState({});
  const [totalChecks, setTotalChecks] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);
  const [suggestedCheckNum, setSuggestedCheckNum] = useState('');

  const location = useLocation();
  const history = useHistory();

  // Load static data once on mount
  useEffect(() => { loadStaticData(); }, []);
  // Load paginated history on mount and when page/pageSize/search changes
  useEffect(() => { loadCheckHistory(); }, [page, pageSize, searchText]);
  // Load stats on mount (and after mutations)
  useEffect(() => { loadCheckStats(); }, []);

  // Auto-load check passed from Pay Bills/Bill Tracker via query param
  const autoLoadCheckId = useMemo(() => {
    const id = new URLSearchParams(location.search).get('checkId');
    return id ? Number(id) : null;
  }, [location.search]);
  const autoLoadDone = useRef(false);
  // Load the check immediately instead of waiting for the static payees list.
  // Payee name comes straight from the transaction, so there is no need to
  // block on payees before showing the check details.
  useEffect(() => {
    if (autoLoadDone.current || !autoLoadCheckId) return;
    const doLoad = async () => {
      const txn = await window.electronAPI.getTransaction(autoLoadCheckId);
      if (!txn || txn.error) return;
      autoLoadDone.current = true;
      const record = {
        ...txn,
        id: txn.id,
        date: txn.date,
        accountId: txn.accountId,
        reference: txn.reference,
        description: txn.description || '',
        amount: Number(txn.amount || txn.debit || 0),
        debit: Number(txn.debit || 0),
        payee_name: txn.payee_name || '',
      };
      autoLoadedPayeeName.current = record.payee_name || '';
      handleEditCheck(record);
    };
    doLoad();
  }, [autoLoadCheckId]);

  // Once the payees list is ready, refresh the auto-loaded check so the payee
  // address (used in the envelope window) is resolved from the vendor record.
  const autoLoadedPayeeName = useRef('');
  useEffect(() => {
    if (!autoLoadCheckId) return;
    if (!autoLoadedPayeeName.current) return;
    const matchedPayee = payees.find(p => p.name === autoLoadedPayeeName.current);
    if (matchedPayee) {
      form.setFieldsValue({ payee: matchedPayee.id, payeeAddress: formatPayeeAddress(matchedPayee) });
      setWatchPayeeAddress(formatPayeeAddress(matchedPayee));
    }
  }, [payees, autoLoadCheckId]);

  const loadStaticData = async () => {
    try {
      const [accRes, vendorsRes, customersRes, employeesRes, companyRes] = await Promise.all([
        // ALL accounts. The Bank Account field filters this to Bank; the Split
        // Lines field needs every account a payment can be posted against.
        // Fetching Bank-only here is exactly what wrongly made the Split Lines
        // selector show Bank accounts only.
        window.electronAPI.getChartOfAccounts(),
        window.electronAPI.getAllSuppliers().catch(() => []),
        window.electronAPI.getAllCustomers().catch(() => ({ all: [] })),
        window.electronAPI.getEmployees ? window.electronAPI.getEmployees().catch(() => []) : Promise.resolve([]),
        window.electronAPI.getCompany?.().catch(() => ({})),
      ]);

      const accs = Array.isArray(accRes) ? accRes : (accRes?.data || []);
      setAccounts(dedupeAccounts(accs));
      setBankAccounts(getBankAccounts(accs));

      const vendors = Array.isArray(vendorsRes) ? vendorsRes : (vendorsRes?.data || vendorsRes?.all || []);
      const customers = Array.isArray(customersRes?.all) ? customersRes.all : (Array.isArray(customersRes) ? customersRes : []);
      const employees = Array.isArray(employeesRes?.data) ? employeesRes.data : (Array.isArray(employeesRes) ? employeesRes : []);
      const merged = [
        ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || v.name || `${v.first_name||''} ${v.last_name||''}`.trim(), type: 'Vendor', _raw: v })),
        ...customers.map(c => ({ id: `c-${c.id}`, name: c.display_name || `${c.first_name||''} ${c.last_name||''}`.trim(), type: 'Customer', _raw: c })),
        ...employees.map(e => ({ id: `e-${e.id}`, name: e.name || `${e.first_name||''} ${e.last_name||''}`.trim(), type: 'Employee', _raw: e })),
      ].filter(p => p.name);
      setPayees(merged);

      if (companyRes && !companyRes.error) setCompany(companyRes);
    } catch (e) {
      console.error('Failed to load static data:', e);
      setAccounts([]); setPayees([]);
    }
  };

  const loadCheckHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await window.electronAPI.getTransactionsPaginated?.({ page, pageSize, search: searchText, type: 'Check' }).catch(() => ({ data: [], total: 0 }));
      if (res && res.error) { setCheckHistory([]); setHistoryTotal(0); return; }
      const items = (res?.data || []).map((t, i) => ({ ...t, key: t.id || i }));
      setCheckHistory(items);
      setHistoryTotal(res?.total || 0);
    } catch { setCheckHistory([]); setHistoryTotal(0); }
    finally { setHistoryLoading(false); }
  };

  const loadCheckStats = async () => {
    try {
      const stats = await window.electronAPI.getCheckStats?.().catch(() => null);
      if (stats && !stats.error) {
        setTotalChecks(stats.total);
        setThisMonthCount(stats.thisMonthCount);
        setSuggestedCheckNum(stats.nextCheckNumber);
      }
    } catch {}
  };

  const loadBankAccounts = async () => {
    try {
      const accRes = await window.electronAPI.getChartOfAccounts();
      const accs = Array.isArray(accRes) ? accRes : (accRes?.data || []);
      setAccounts(dedupeAccounts(accs));
      setBankAccounts(getBankAccounts(accs));
    } catch {}
  };

  const reloadAll = () => {
    loadCheckHistory();
    loadCheckStats();
    loadBankAccounts();
  };

  // Sync suggestedCheckNum to form when it loads
  useEffect(() => {
    if (suggestedCheckNum) form.setFieldsValue({ checkNumber: suggestedCheckNum });
  }, [suggestedCheckNum]);

  const [amount, setAmount] = useState(0);
  const [watchDate, setWatchDate] = useState(null);
  const [watchPayeeName, setWatchPayeeName] = useState('');
  const [watchPayeeAddress, setWatchPayeeAddress] = useState('');
  const [watchCheckNumber, setWatchCheckNumber] = useState('');
  const [watchMemo, setWatchMemo] = useState('');
  const [watchAccountId, setWatchAccountId] = useState(null);
  const [splitLines, setSplitLines] = useState([{ key: 1, account: '', accountId: undefined, description: '', amount: 0 }]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const attachmentRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [togglingPrintedId, setTogglingPrintedId] = useState(null);
  const [openBills, setOpenBills] = useState([]);
  const [openBillsVisible, setOpenBillsVisible] = useState(false);
  const [openBillsVendorId, setOpenBillsVendorId] = useState(null);
  const [openBillsLoading, setOpenBillsLoading] = useState(false);
  const [openBillsVendorName, setWatchOpenBillsVendorName] = useState('');
  const [openBillsTotal, setOpenBillsTotal] = useState(0);
  const [openBillsCount, setOpenBillsCount] = useState(0);
  const [showInlineWarning, setShowInlineWarning] = useState(false);
  const [confirmRecordVisible, setConfirmRecordVisible] = useState(false);
  const [pendingRecordArgs, setPendingRecordArgs] = useState(null);

  const splitTotal = useMemo(() => sumMoney(splitLines.map(l => l.amount)), [splitLines]);
  // True when at least one split line carries a non-zero amount. In that mode
  // the check Amount is DERIVED from the split lines (single source of truth);
  // otherwise the unsplit workflow lets the user type the amount directly.
  const hasSplitAmounts = useMemo(
    () => splitLines.some(l => toCents(l.amount) !== 0),
    [splitLines]
  );

  // Keep the check amount synchronized with the split total. Only writes when
  // the value actually differs, so it can never create a render/effect loop.
  useEffect(() => {
    if (!hasSplitAmounts) return;
    if (Math.abs((Number(amount) || 0) - splitTotal) > 0.005) {
      setAmount(splitTotal);
      form.setFieldsValue({ amount: splitTotal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitTotal, hasSplitAmounts]);

  const addSplitLine = () => setSplitLines(prev => [...prev, { key: Date.now(), account: '', accountId: undefined, description: '', amount: 0 }]);
  const removeSplitLine = (key) => setSplitLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  const updateSplitLine = (key, field, value) => setSplitLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

  const resolveAccountId = (name) => {
    if (!name) return undefined;
    const a = accounts.find(x => (x.accountName || x.name) === name);
    return a ? Number(a.id) : undefined;
  };
  const updateSplitLineAccount = (key, id) => {
    const a = accounts.find(x => Number(x.id) === Number(id));
    setSplitLines(prev => prev.map(l => l.key === key ? {
      ...l,
      account: a ? (a.accountName || a.name) : (l.account || ''),
      accountId: id,
    } : l));
  };

  // Check for open (unpaid) bills when a vendor is selected on the Write Check screen
  const checkOpenBills = useCallback(async (vendorId, vendorName) => {
    if (!vendorId) {
      setShowInlineWarning(false);
      setOpenBills([]);
      setOpenBillsTotal(0);
      setOpenBillsCount(0);
      return;
    }
    setOpenBillsLoading(true);
    try {
      const res = await window.electronAPI.getOpenBills?.(vendorId).catch(() => []);
      const bills = Array.isArray(res) ? res : [];
      // Balance due per bill = amount - paid_amount (actual remaining, not original total)
      const totalDue = bills.reduce((sum, b) => sum + (Number(b.amount || 0) - Number(b.paid_amount || 0)), 0);
      if (bills.length > 0 && totalDue > 0.005) {
        setOpenBills(bills);
        setOpenBillsVendorId(vendorId);
        setOpenBillsVisible(true);
        setWatchOpenBillsVendorName(vendorName || '');
        setOpenBillsTotal(totalDue);
        setOpenBillsCount(bills.length);
        setShowInlineWarning(true);
      } else {
        setOpenBills([]);
        setOpenBillsTotal(0);
        setOpenBillsCount(0);
        setShowInlineWarning(false);
      }
    } catch (e) {
      console.error('Failed to check open bills:', e);
    } finally {
      setOpenBillsLoading(false);
    }
  }, []);

  const amountWords = useMemo(() => {
    const n = Number(amount || 0);
    if (n === 0) return 'Zero and 00/100 Dollars';
    const dollars = Math.floor(n);
    const cents = Math.round((n - dollars) * 100);
    return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100 Dollars`;
  }, [amount]);

  // Duplicate check detection
  const [isDuplicate, setIsDuplicate] = useState(false);
  useEffect(() => {
    if (!watchCheckNumber) { setIsDuplicate(false); return; }
    window.electronAPI.findTransactionByReference?.({ type: 'Check', reference: watchCheckNumber }).then(res => setIsDuplicate(!!res && !res.error)).catch(() => setIsDuplicate(false));
  }, [watchCheckNumber]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => String(a.id) === String(watchAccountId));
  }, [watchAccountId, accounts]);

  const generateCheckHtml = (vals, forPrint) => {
    const co     = vals._company || company || {};
    const coName = co.name || co.companyName || '';
    const coAddr = [co.address || co.address1, co.city && co.state ? `${co.city}, ${co.state}` : (co.city || co.state || ''), co.phone || co.phone_number || ''].filter(Boolean);

    const dateStr   = vals.date ? (vals.date.format ? vals.date.format('MM/DD/YYYY') : vals.date) : '';
    const payeeName = vals.payeeName || '';
    const payeeAddr = vals.payeeAddress || '';
    const amt       = Number(vals.amount || 0);
    const amtStr    = amt.toFixed(2);
    const memoLine  = vals.memo || '';
    const splitLns  = (vals.splitLines || []).filter(l => Number(l.amount) > 0);

    const words = (() => {
      const dollars = Math.floor(amt);
      const cents   = Math.round((amt - dollars) * 100);
      return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100`;
    })();

    // Written amount (in words) — preprinted stock supplies the line,
    // so the words print cleanly with a rule below (QuickBooks-style).
    const wordsLine = words;

    // â”€â”€ Stub detail rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const detailRows = splitLns.length > 0
      ? splitLns.map(l => `
          <tr>
            <td style="padding:1px 0; font-size:11px;">${l.description || l.account || ''}</td>
            <td style="padding:1px 0; font-size:11px; text-align:right;">${Number(l.amount||0).toFixed(2)}</td>
          </tr>`).join('')
      : memoLine
        ? `<tr>
            <td style="padding:1px 0; font-size:11px;">${memoLine}</td>
            <td style="padding:1px 0; font-size:11px; text-align:right;">${amtStr}</td>
          </tr>`
        : '';

    // â”€â”€ Remittance stub (two copies rendered below check) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const stub = () => `
      <div style="padding:8px 28px 6px; font-family:Arial,sans-serif; min-height:155px; box-sizing:border-box;">
        <!-- Stub header row: company | date -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:3px;">
          <tr>
            <td style="font-size:12px; font-weight:700; width:50%;">${coName}</td>
            <td style="font-size:11px; text-align:center; width:25%;">${dateStr}</td>
            <td style="font-size:12px; font-weight:700; text-align:right; width:25%;"></td>
          </tr>
        </table>
        <!-- Payee + amount -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:2px;">
          <tr>
            <td style="font-size:11px; width:70%;">${payeeName}</td>
            <td style="font-size:12px; font-weight:700; text-align:right; width:30%;">${amtStr}</td>
          </tr>
        </table>
        <!-- Detail lines -->
        <table style="width:100%; border-collapse:collapse;">
          ${detailRows}
        </table>
        <!-- Spacer + total row -->
        <div style="height:30px;"></div>
        <table style="width:100%; border-collapse:collapse; border-top:1px solid #bbb; padding-top:3px;">
          <tr>
            <td style="font-size:11px; padding-top:3px;">${memoLine}</td>
            <td style="font-size:12px; font-weight:700; text-align:right; padding-top:3px;">${amtStr}</td>
          </tr>
        </table>
      </div>`;

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       CHECK BODY — pre-printed US check stock layout.
       Prints ONLY the dynamic fields, in this vertical order:

           Date                                    (top right)
           Numeric amount                          (right)
           Payee name (bold)                       (above the words)
           Written amount                          (in words)
           Payee address lines                     (below the words)
           Memo                                    (only if entered)

       Static stock elements are NOT printed: the check number, the amount
       rule under the written amount, the cheque outline, and the signature
       line / "Authorized Signature" label. Two remittance stubs follow.
       All physical offsets live in the :root block above.
       â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    const payeeAddrLines = (payeeAddr || '').split('\n').filter(Boolean);

    return `<!doctype html><html><head><title>Check</title>
    <style>
      /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
         PHYSICAL CALIBRATION — the only place offsets are defined.
         Tune these against a real print run; nothing below hard-codes a
         position. Moving --check-offset-x/y shifts the whole cheque body
         as one piece without disturbing the internal layout.
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
      :root {
        --check-offset-x: 0in;    /* nudge the whole body left/right */
        --check-offset-y: 0in;    /* nudge the whole body up/down    */
        --check-pad-left: 28px;   /* left inset of the printed fields  */
        --check-pad-right: 28px;  /* right inset of the printed fields */
        --check-date-top: 8px;    /* date band            */
        --check-amount-top: 26px; /* numeric amount       */
        --check-payee-top: 6px;   /* payee name           */
        --check-words-top: 6px;   /* written amount       */
        --check-addr-top: 14px;   /* payee address        */
        --check-memo-top: 8px;    /* memo                 */
      }
      @page { margin: 0.25in 0.35in; size: letter portrait; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; background: #fff; color: #1a1a1a; font-size: 13px; }

      /* No border-bottom: pre-printed stock supplies the cheque outline and
         the perforation, so a printed rule would be an extra line. */
      .check-wrap { position: relative; height: 310px; overflow: hidden; page-break-inside: avoid; }
      .check-inner {
        position: absolute; inset: 0;
        padding-left: var(--check-pad-left);
        padding-right: var(--check-pad-right);
        margin-left: var(--check-offset-x);
        margin-top: var(--check-offset-y);
      }

      /* ---------- DATE (top-right; the stock carries the label) ---------- */
      .date-row { display: flex; justify-content: flex-end; align-items: center; margin-top: var(--check-date-top); }
      .date-val { font-size: 13px; font-weight: 700; min-width: 100px; text-align: center; }

      /* ---------- NUMERIC AMOUNT ---------- */
      .amount-row { display: flex; justify-content: flex-end; align-items: flex-end; margin-top: var(--check-amount-top); }
      .amount-box { font-size: 12px; font-weight: 700; white-space: nowrap; padding: 2px 10px; }

      /* ---------- PAYEE NAME (bold) - printed ABOVE the written amount ------ */
      .payee-row  { margin-top: var(--check-payee-top); }
      .payee-name { font-weight: 700; font-size: 14px; }

      /* ---------- WRITTEN AMOUNT (largest of the three; no rule beneath,
                     the pre-printed stock supplies it) ---------- */
      .words-row { margin-top: var(--check-words-top); }
      .words-text { font-size: 16px; letter-spacing: 0.02em; display: block; }

      /* ---------- PAYEE ADDRESS (below the written amount) ---------- */
      .addr-window { margin-top: var(--check-addr-top); font-size: 12px; line-height: 1.45; min-height: 64px; }

      /* ---------- MEMO ---------- */
      .memo-sig-row { margin-top: var(--check-memo-top); }
      .memo-val { font-size: 12px; }

      /* ---------- stubs ---------- */
      .stub-wrap { border-bottom: 1px dashed #999; }
      .stub-wrap.stub-last { border-bottom: none; }
    </style></head><body>

      <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• CHECK BODY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
      <div class="check-wrap">
        <div class="check-inner">

          <!-- DATE. The check number is deliberately NOT printed: the
               pre-printed stock already carries it. -->
          <div class="date-row">
            <span class="date-val">${dateStr}</span>
          </div>

          <!-- NUMERIC AMOUNT -->
          <div class="amount-row">
            <span class="amount-box">${cSym}${amtStr}</span>
          </div>

          <!-- PAYEE NAME (bold) - printed ABOVE the written amount, as the
               pre-printed cheque stock expects. It is ALSO printed on the
               remittance stub below; the two serve different parts of the
               physical cheque and must not be deduplicated. -->
          <div class="payee-row">
            <span class="payee-name">${payeeName || ''}</span>
          </div>

          <!-- WRITTEN AMOUNT (in words). No rule beneath it - the
               pre-printed stock supplies that line. -->
          <div class="words-row">
            <span class="words-text">${wordsLine}</span>
          </div>

          <!-- PAYEE ADDRESS - printed BELOW the written amount. -->
          <div class="addr-window">
            ${payeeAddrLines.map(l => `<div>${l}</div>`).join('')}
          </div>

          <!-- Memo only when the user enters one -->
          ${memoLine ? `
          <div class="memo-sig-row">
            <span class="memo-val">${memoLine}</span>
          </div>` : ''}

        </div>
      </div>

      <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STUB 1 â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
      <div class="stub-wrap">${stub()}</div>

      <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STUB 2 â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
      <div class="stub-wrap stub-last">${stub()}</div>

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

  const handlePrint = async (vals) => {
    vals.accountName = vals.accountName || selectedAccount?.accountName || selectedAccount?.name || '';
    vals.payeeAddress = vals.payeeAddress || form.getFieldValue('payeeAddress') || '';
    vals._company = vals._company || company;
    const html = generateCheckHtml(vals, true);
    const w = window.open('', '_blank');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
    if (vals.checkNumber) {
      const txns = await window.electronAPI.getTransactions?.();
      const check = Array.isArray(txns) ? txns.find(t => t.reference === vals.checkNumber && (t.type || '').toLowerCase() === 'check') : null;
      if (check?.id) {
        await window.electronAPI.markCheckPrinted?.(check.id);
        reloadAll();
      }
    }
  };

  const onFinish = async (values, saveOnly) => {
    if (editingId) {
      await updateAndPrint(values, saveOnly);
      return;
    }
    if (isDuplicate) {
      message.error(`Check #${values.checkNumber} already exists. Check numbers must be unique.`);
      return;
    }
    // If the selected vendor has open bills, show a confirmation before recording
    if (showInlineWarning && openBills.length > 0) {
      setPendingRecordArgs({ values, saveOnly });
      setConfirmRecordVisible(true);
      return;
    }
    await recordAndPrint(values, saveOnly);
  };

  const recordOnly = async (values) => {
    await recordAndPrint(values, true);
  };

  const recordAndPrint = async (values, recordOnlyFlag) => {
    try {
      setLoading(true);
      const userAmt = Number(values.amount || 0);
      const validSplits = splitLines.filter(l => Number(l.amount) > 0);
      const totalAmt = validSplits.length > 0 ? splitTotal : userAmt;
      // Validate split lines match check amount — block if mismatch
      if (validSplits.length > 0 && userAmt > 0 && Math.abs(splitTotal - userAmt) > 0.005) {
        message.error(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${userAmt.toFixed(2)}). Please correct the amounts before proceeding.`);
        setLoading(false);
        return;
      }
      // Validate each split line with an amount has an account selected
      if (validSplits.some(l => !l.account)) {
        message.error('Each split line with an amount must have an expense account selected.');
        setLoading(false);
        return;
      }
      // Validate total amount is > 0
      if (totalAmt <= 0) {
        message.error('Check amount must be greater than zero.');
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
        payee_name: values.payeeName || '',
        payee_address: values.payeeAddress || '',
        entered_by: 'system',
        splitLines: splitLines.filter(l => Number(l.amount) > 0).map(l => ({ account: l.account, accountId: l.accountId ?? resolveAccountId(l.account), description: l.description, amount: Number(l.amount) })),
      };
      const res = await window.electronAPI.insertTransaction(payload);
      if (res && res.error) throw new Error(res.error);
      const txId = res?.lastInsertRowid || res?.id || res?.invoiceId || null;
      if (txId) await attachmentRef.current?.uploadPending(txId);
      message.success(`Check #${values.checkNumber} recorded successfully`);
      if (!recordOnlyFlag) {
        const vals = { ...values, accountName: selectedAccount?.accountName || selectedAccount?.name, splitLines: splitLines.filter(l => l.amount > 0), _company: company };
        handlePrint(vals);
      }
      form.resetFields();
      setSplitLines([{ key: 1, account: '', description: '', amount: 0 }]);
      setAmount(0);
      setPendingFiles([]);
      
      form.setFieldsValue({ date: moment(), checkNumber: String(Number(values.checkNumber || 0) + 1) });
      reloadAll();
    } catch (e) {
      message.error(e?.message || 'Failed to record check');
    } finally {
      setLoading(false);
    }
  };

  const updateAndPrint = async (values, updateOnly) => {
    try {
      setLoading(true);
      const userAmt = Number(values.amount || 0);
      const validSplits = splitLines.filter(l => Number(l.amount) > 0);
      const totalAmt = validSplits.length > 0 ? splitTotal : userAmt;
      // Validate split lines match check amount — block if mismatch
      if (validSplits.length > 0 && userAmt > 0 && Math.abs(splitTotal - userAmt) > 0.005) {
        message.error(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${userAmt.toFixed(2)}). Please correct the amounts before proceeding.`);
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
        payee_name: values.payeeName || '',
        payee_address: values.payeeAddress || '',
        entered_by: 'system',
        splitLines: splitLines.filter(l => Number(l.amount) > 0).map(l => ({ account: l.account, accountId: l.accountId ?? resolveAccountId(l.account), description: l.description, amount: Number(l.amount) })),
      };
      const res = await window.electronAPI.updateTransaction(editingId, payload);
      if (res && res.error) throw new Error(res.error);
      await attachmentRef.current?.uploadPending(editingId);
      message.success(`Check #${values.checkNumber} updated`);
      if (!updateOnly) {
        const vals = { ...values, accountName: selectedAccount?.accountName || selectedAccount?.name, splitLines: splitLines.filter(l => l.amount > 0), _company: company };
        handlePrint(vals);
      }
      cancelEdit();
      reloadAll();
    } catch (e) {
      message.error(e?.message || 'Failed to update check');
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPendingFiles([]);
    
    form.resetFields();
    setSplitLines([{ key: 1, account: '', description: '', amount: 0 }]);
    setAmount(0);
    form.setFieldsValue({ date: moment(), checkNumber: suggestedCheckNum || '1001' });
  };

  const openCheckJournal = async (record) => {
    if (!record || !record.id) return;
    try {
      const res = await window.electronAPI.journalGetBySource?.('transaction', record.id);
      if (res && !res.error && res.id) setJournalDetailId(res.id);
      else message.info('No journal entry posted for this check');
    } catch { message.error('Failed to load journal entry'); }
  };

  const handleDelete = async (record) => {
    if (!record || !record.id) return;
    try {
      const res = await window.electronAPI.deleteCheck(record.id);
      if (res?.success) {
        message.success(`Check #${record.reference} deleted and payment reversed.`);
        reloadAll();
      } else {
        message.error(res?.error || 'Failed to delete check');
      }
    } catch (e) {
      message.error(e?.message || 'Failed to delete check');
    }
  };

  // A check that pays one or more bills gets an explicit warning naming those
  // bills; a normal write check keeps the plain delete confirmation.
  const confirmDeleteCheck = async (record) => {
    if (!record || !record.id) return;
    let applications = [];
    try {
      const res = await window.electronAPI.getCheckBillApplications?.(record.id);
      if (Array.isArray(res)) applications = res;
    } catch { applications = []; }

    const billLinked = applications.length > 0;
    const total = applications.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const content = billLinked
      ? (applications.length === 1
          ? `This check is applied to 1 vendor bill (${applications[0].billNumber || '#' + applications[0].billId}) for ${cSym} ${fmt(total)}. Deleting it will reverse the payment and reopen the affected bill. This cannot be undone.`
          : `This check is applied to ${applications.length} vendor bills totaling ${cSym} ${fmt(total)}. Deleting it will reverse those payment allocations and reopen the affected bills. This cannot be undone.`)
      : 'This will permanently delete the check and reverse its posting (restore the bank/expense accounts). This cannot be undone.';

    Modal.confirm({
      title: `Delete Check #${record.reference}?`,
      content,
      okText: billLinked ? 'Delete & Reverse Payment' : 'Delete',
      okType: 'danger',
      onOk: () => handleDelete(record),
    });
  };

  // Only treat the description as a real memo when it was user-typed (not an
  // auto-generated placeholder like "Check #12 to Acme" or a bill-payment banner).
  const memoFromDescription = (desc) => {
    if (!desc) return '';
    if (/^Check #?\d*\s*to\s/i.test(desc)) return '';
    if (/^Payment for bill\s/i.test(desc)) return '';
    if (/^Bill payment to\s/i.test(desc)) return '';
    return desc.trim();
  };

  const handleReprintHistory = (record) => {
    const desc = (record.description || '');
    const payeeName = record.payee_name?.trim() ||
      desc.replace(/^Check #?\d*\s*to\s*/i, '').replace(/^Payment for bill\s+\S+\s*-\s*/i, '').replace(/^Bill payment to\s+(.+?)\s*—?\s*(?:Bill|#)\s*\S*/i, '$1').trim() ||
      desc;
    // The transaction carries its own payee address, so reprinting never needs
    // a second name-based payee lookup. The lookup is a FALLBACK only, for
    // checks recorded before the address was persisted.
    const storedAddress = (record.payee_address || '').trim();
    const matchedPayee = storedAddress ? null : payees.find(p => p.name === payeeName);
    const payeeAddress = storedAddress || (matchedPayee ? formatPayeeAddress(matchedPayee) : '');
    const vals = {
      date: record.date ? { format: (f) => moment(record.date).format(f) } : null,
      payeeName,
      payeeAddress,
      amount: record.amount || record.debit || 0,
      checkNumber: record.reference || '',
      memo: memoFromDescription(desc),
      accountName: '',
    };
    handlePrint(vals).then(() => reloadAll());
  };

  const handleEditCheck = async (record) => {
    let payeeName = (record.payee_name || '').trim();
    if (!payeeName) {
      const desc = (record.description || '').replace(/^Check #?\d*\s*to\s*/i, '').trim();
      const m = desc.match(/^Payment for bill\s+\S+\s*-\s*(.+)$/i) || desc.match(/^Bill payment to\s+(.+?)\s*—?\s*(?:Bill|#)/i);
      payeeName = (m && m[1] ? m[1] : desc).trim() || record.description || '';
    }
    // Prefer the address stored on the transaction; fall back to the payee
    // record only when the check predates address persistence.
    const storedAddress = (record.payee_address || '').trim();
    const matchedPayee = storedAddress ? null : payees.find(p => p.name === payeeName);
    const payeeAddress = storedAddress || (matchedPayee ? formatPayeeAddress(matchedPayee) : '');
    let splitData = record.splitLines;
    if (!splitData || splitData.length === 0) {
      try {
        const fullTxn = await window.electronAPI.getTransaction(record.id);
        if (fullTxn && !fullTxn.error) {
          const jeList = await window.electronAPI.journalList?.().catch(() => []);
          const je = (Array.isArray(jeList) ? jeList : []).find(e => e.source_type === 'transaction' && String(e.source_id) === String(record.id) && e.status === 'Posted');
          if (je && je.lines && je.lines.length > 0) {
            splitData = je.lines.filter(l => Number(l.debit || 0) > 0 && l.accountName).map(l => ({ account: l.accountName || l.account || '', accountId: l.accountId ?? undefined, description: l.description || l.lineDesc || '', amount: Number(l.debit || 0) }));
          }
        }
      } catch {}
    }
    const existingLines = splitData && splitData.length > 0
      ? splitData.map((l, i) => ({ key: i, account: l.account || l.category || '', accountId: l.accountId ?? resolveAccountId(l.account || l.category), description: l.description || '', amount: Number(l.amount || 0) }))
      : [{ key: 1, account: '', accountId: undefined, description: '', amount: Number(record.amount || 0) }];
    setSplitLines(existingLines);
    setEditingId(record.id);
    const checkAmount = Number(record.amount || record.debit || 0);
    setAmount(checkAmount);
    form.setFieldsValue({
      date: record.date ? moment(record.date) : moment(),
      accountId: Number(record.accountId) || undefined,
      checkNumber: record.reference || '',
      payee: matchedPayee?.id || undefined,
      payeeName,
      payeeAddress,
      amount: checkAmount,
      memo: memoFromDescription(record.description || ''),
    });
    setWatchAccountId(Number(record.accountId) || undefined);
    setWatchPayeeName(payeeName);
    setWatchPayeeAddress(payeeAddress);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  const historyColumns = [
    { title: '#', dataIndex: 'reference', key: 'reference', width: 80, render: v => <Text strong>{v || '-'}</Text> },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: (v, r) => <Text strong>${fmt(v || r.debit || 0)}</Text> },
    { title: 'Printed', key: 'printed', width: 110, render: (_, r) => (
      <Tag color={r.printed ? 'green' : 'orange'} style={{ cursor: 'pointer' }} onClick={async () => {
        if (togglingPrintedId === r.id) return;
        setTogglingPrintedId(r.id);
        await window.electronAPI.markCheckPrinted?.(r.id, r.printed ? 0 : 1);
        await reloadAll();
        setTogglingPrintedId(null);
      }}>
        {togglingPrintedId === r.id ? <Spin size="small" /> : (r.printed ? 'Printed' : 'Not Printed')}
      </Tag>
    )},
    { title: 'Status', key: 'status', width: 80, render: (_, r) => {
      const s = (r.status || 'active').toLowerCase();
      return s === 'void' ? <Tag color="red">Void</Tag> : <Tag color="green">Active</Tag>;
    }},
    { title: 'Actions', key: 'actions', width: 280, render: (_, r) => (
      <Space size="small">
        <Tooltip title="View journal entry"><Button type="text" size="small" icon={<BookOutlined />} onClick={() => openCheckJournal(r)} /></Tooltip>
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditCheck(r)} /></Tooltip>
        <Tooltip title="Reprint"><Button type="text" size="small" icon={<PrinterOutlined />} onClick={() => handleReprintHistory(r)} /></Tooltip>
        <Tooltip title="Delete & reverse payment"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteCheck(r)} /></Tooltip>
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
            <Statistic title="Bank Balance"
              value={watchAccountId && selectedAccount ? Number(selectedAccount.balance || 0) : '—'}
              precision={watchAccountId && selectedAccount ? 2 : undefined}
              prefix={watchAccountId && selectedAccount ? cSym : undefined}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedAccount ? (selectedAccount.accountName || selectedAccount.name) : 'Select a bank account'}
            </Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="This Month" value={thisMonthCount} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
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
          <div ref={formRef}>
          <Card title={<><DollarOutlined style={{ marginRight: 4 }} />{editingId ? ' Edit Check' : ' Write a Check'}</>} size="small"
            extra={editingId ? <Button size="small" onClick={cancelEdit}>Cancel Edit</Button> : null}>
            {isDuplicate && (
              <Alert message={`Check #${watchCheckNumber} already exists!`} type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }} />
            )}

            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: moment(), checkNumber: suggestedCheckNum }}>

              <FormSection title="Check Details" icon={<DollarOutlined />}>
                <FormGrid columns={4}>
                  <FormCol>
                    <Form.Item name="date" label="Date" rules={[{ required: true }]} style={FORM_ITEM_STYLE}>
                      <DatePicker style={{ width: '100%' }} onChange={(d) => setWatchDate(d)} />
                    </Form.Item>
                  </FormCol>
                  <FormCol span={2}>
                    <Form.Item name="accountId" label="Bank Account" rules={[{ required: true, message: 'Select bank account' }]} style={FORM_ITEM_STYLE}>
                      <AccountSelect accounts={bankAccounts} placeholder="Select bank account" onChange={(v) => setWatchAccountId(v)} />
                    </Form.Item>
                  </FormCol>
                  <FormCol>
                    <Form.Item name="checkNumber" label="Check #" rules={[{ required: true, message: 'Required' }]} validateStatus={isDuplicate ? 'warning' : undefined} help={isDuplicate ? 'Duplicate number' : undefined} style={FORM_ITEM_STYLE}>
                      <Input placeholder={suggestedCheckNum} onChange={(e) => setWatchCheckNumber(e.target.value)} />
                    </Form.Item>
                  </FormCol>
                </FormGrid>

                <FormGrid columns={2}>
                  <FormCol>
                    <Form.Item name="payee" label="Pay To" style={FORM_ITEM_STYLE}>
                      <Select showSearch optionFilterProp="children" placeholder="Select payee" allowClear onChange={(val, opt) => {
                        const name = opt?.children || '';
                        form.setFieldsValue({ payeeName: name });
                        setWatchPayeeName(name);
                        if (val) {
                          const payee = payees.find(p => p.id === val);
                          if (payee) {
                            const addr = formatPayeeAddress(payee);
                            form.setFieldsValue({ payeeAddress: addr });
                            setWatchPayeeAddress(addr);
                          }
                          // Warn about open (unpaid) bills for this vendor
                          if (val.startsWith('v-')) {
                            checkOpenBills(Number(val.replace('v-', '')), name);
                          } else {
                            // Non-vendor payee (customer/employee) — clear any prior vendor warning
                            setShowInlineWarning(false);
                            setOpenBills([]);
                            setOpenBillsTotal(0);
                            setOpenBillsCount(0);
                          }
                        } else {
                          form.setFieldsValue({ payeeAddress: '' });
                          setWatchPayeeAddress('');
                          setShowInlineWarning(false);
                          setOpenBills([]);
                          setOpenBillsTotal(0);
                          setOpenBillsCount(0);
                        }
                      }}>
                        {payees.map(p => (
                          <Option key={p.id} value={p.id}>{p.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </FormCol>
                  <FormCol>
                    <Form.Item name="payeeName" label="Payee Name (override)" style={FORM_ITEM_STYLE}>
                      <Input placeholder="Or type payee name directly" onChange={(e) => setWatchPayeeName(e.target.value)} />
                    </Form.Item>
                  </FormCol>
                </FormGrid>

                {/* Inline warning when the selected vendor has unpaid bills */}
                {showInlineWarning && openBills.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginBottom: 12 }}
                    message={`This vendor has ${openBillsCount} unpaid bill${openBillsCount > 1 ? 's' : ''} totaling ${cSym}${fmt(openBillsTotal)}.`}
                    description={
                      <Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Writing a manual check will not automatically apply this payment to those bills.
                        </Text>
                        <Button size="small" type="link" icon={<DollarOutlined />} onClick={() => setOpenBillsVisible(true)}>
                          View Open Bills
                        </Button>
                      </Space>
                    }
                    closable
                    onClose={() => setShowInlineWarning(false)}
                  />
                )}

                <FormGrid columns={4}>
                  <FormCol>
                    <Form.Item name="amount" label="Amount ($)" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]} style={FORM_ITEM_STYLE}>
                      <InputNumber min={0} step={0.01} readOnly={hasSplitAmounts} style={{ width: '100%', background: hasSplitAmounts ? '#f9f9f9' : undefined }} formatter={v => v ? `${cSym} ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/[^\d.,-]/g, '')} onChange={(v) => setAmount(v || 0)} onBlur={() => { const nonZero = splitLines.filter(l => Number(l.amount) > 0); if (nonZero.length > 0 && (amount || 0) > 0 && Math.abs(splitTotal - (amount || 0)) > 0.005) message.warning(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${(amount || 0).toFixed(2)}). Please correct before recording.`); }} />
                    </Form.Item>
                  </FormCol>
                  <FormCol span={3}>
                    <Form.Item label="In Words" style={FORM_ITEM_STYLE}>
                      <Input value={amountWords} readOnly style={{ fontStyle: 'italic', background: '#f9f9f9' }} />
                    </Form.Item>
                  </FormCol>
                </FormGrid>
                {splitLines.filter(l => Number(l.amount) > 0).length > 0 && Math.abs(splitTotal - (amount || 0)) > 0.005 && (
                  <Alert message={`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${(amount || 0).toFixed(2)}). You will not be able to record or print until this is corrected.`} type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 8 }} />
                )}

                <FormGrid columns={2}>
                  <FormCol>
                    <Form.Item name="payeeAddress" label="Payee Address" style={FORM_ITEM_STYLE}>
                      <TextArea rows={2} placeholder="Payee mailing address (shown in the envelope window)" style={{ fontFamily: 'inherit' }} onChange={(e) => setWatchPayeeAddress(e.target.value)} />
                    </Form.Item>
                  </FormCol>
                  <FormCol>
                    <Form.Item name="memo" label="Memo" style={FORM_ITEM_STYLE}>
                      <TextArea rows={2} placeholder="What is this check for?" maxLength={200} showCount onChange={(e) => setWatchMemo(e.target.value)} />
                    </Form.Item>
                  </FormCol>
                </FormGrid>
              </FormSection>

              <FormSection title="Attachments" icon={<PaperClipOutlined />}>
                <AttachmentManager
                  ref={attachmentRef}
                  entityType="check"
                  entityId={editingId}
                  pendingFiles={pendingFiles}
                  onPendingChange={setPendingFiles}
                  entityLabel="Check"
                  emptyText="No attachments yet — attach the check stub or receipt."
                />
              </FormSection>

              <FormSection title="Split Lines (Expense Accounts)" icon={<UnorderedListOutlined />}>
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
                        <AccountSelect size="small" accounts={splitAccounts} placeholder="Account" value={line.accountId ?? resolveAccountId(line.account)} onChange={v => updateSplitLineAccount(line.key, v)} style={{ width: '100%' }} allowClear />
                      </div>
                      <div style={{ flex: 2 }}>
                        <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} />
                      </div>
                      <div style={{ flex: '0 0 100px' }}>
                        <InputNumber size="small" min={0} step={0.01} placeholder="0.00" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} onBlur={() => { const nonZero = splitLines.filter(l => Number(l.amount) > 0); if (nonZero.length > 0 && (amount || 0) > 0 && Math.abs(splitTotal - (amount || 0)) > 0.005) message.warning(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${(amount || 0).toFixed(2)}). Please correct before recording.`); }} style={{ width: '100%' }} />
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
              </FormSection>

              <FormSection title="Actions" icon={<SaveOutlined />}>
                <DocumentActionBar
                  left={<>
                    <Button icon={<EyeOutlined />} onClick={handlePreview}>Preview</Button>
                    <Button icon={<PrinterOutlined />} onClick={() => {
                      const userAmt = Number(form.getFieldValue('amount') || 0);
                      const nonZero = splitLines.filter(l => Number(l.amount) > 0);
                      if (nonZero.length > 0 && userAmt > 0 && Math.abs(splitTotal - userAmt) > 0.005) {
                        message.error(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${userAmt.toFixed(2)}). Please correct the amounts before printing.`);
                        return;
                      }
                      if (editingId) { form.submit(); return; }
                      const vals = form.getFieldsValue(true); vals.accountName = selectedAccount?.accountName || selectedAccount?.name || ''; vals.splitLines = splitLines; handlePrint(vals);
                    }}>Print Only</Button>
                  </>}
                >
                  <Button onClick={async () => { try { const vals = await form.validateFields(); await onFinish(vals, true); } catch {} }} loading={loading} icon={<CheckCircleOutlined />}>{editingId ? 'Update Only' : 'Record Only'}</Button>
                  <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>{editingId ? 'Update & Print' : 'Record & Print'}</Button>
                </DocumentActionBar>
              </FormSection>
            </Form>
          </Card>
          </div>
        </Col>

        {/* Live Preview */}
        <Col xs={24} lg={10}>
          <Card title={<><EyeOutlined style={{ marginRight: 4 }} /> Live Preview</>} size="small" bodyStyle={{ padding: 8, overflow: 'auto' }}>
            <div style={{ transform: 'scale(0.36)', transformOrigin: 'top left', height: 310, width: '278%', overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: generateCheckHtml({
                date: watchDate ? { format: (f) => watchDate.format(f) } : null,
                payeeName: watchPayeeName || '',
                payeeAddress: watchPayeeAddress || form.getFieldValue('payeeAddress') || '',
                amount: hasSplitAmounts ? splitTotal : (amount || 0),
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
        extra={<Input.Search placeholder="Search checks..." onSearch={v => { setSearchText(v); setPage(1); }} allowClear style={{ width: 200 }} />}
      >
        <Table
          columns={historyColumns}
          dataSource={checkHistory}
          loading={historyLoading}
          size="small"
          pagination={{ current: page, pageSize, total: historyTotal, showSizeChanger: true, showTotal: t => `${t} checks`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          scroll={{ x: 600 }}
          locale={{ emptyText: 'No checks recorded yet' }}
        />
      </Card>

      {/* Preview Modal */}
      <Modal title="Check Preview" visible={previewVisible} onCancel={() => setPreviewVisible(false)} width={860} footer={[
        <Button key="close" onClick={() => setPreviewVisible(false)}>Close</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => {
          const userAmt = Number(form.getFieldValue('amount') || 0);
          const nonZero = splitLines.filter(l => Number(l.amount) > 0);
          if (nonZero.length > 0 && userAmt > 0 && Math.abs(splitTotal - userAmt) > 0.005) {
            message.error(`Split lines total (${cSym}${splitTotal.toFixed(2)}) does not equal the check amount (${cSym}${userAmt.toFixed(2)}). Please correct the amounts before printing.`);
            return;
          }
          setPreviewVisible(false); if (editingId) { form.submit(); return; } const vals = form.getFieldsValue(true); vals.accountName = selectedAccount?.accountName || selectedAccount?.name || ''; handlePrint(vals);
        }}>Print</Button>,
      ]}>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Modal>

      {/* Open Bills Warning Modal */}
      <Modal
        title={<><WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />Open Bills Found</>}
        visible={openBillsVisible}
        onCancel={() => setOpenBillsVisible(false)}
        width={560}
        maskClosable={false}
        footer={[
          <Button key="continue" onClick={() => setOpenBillsVisible(false)}>Continue Writing Check</Button>,
          <Button key="paybills" type="primary" icon={<DollarOutlined />} onClick={() => {
            setOpenBillsVisible(false);
            history.push(`/main/vendors/bills/pay?vendor=${openBillsVendorId}`);
          }}>Go to Pay Bills</Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <Text><strong>{openBillsVendorName || 'This vendor'}</strong> has {openBillsCount} unpaid bill{openBillsCount > 1 ? 's' : ''} totaling <strong>{cSym}{fmt(openBillsTotal)}</strong>.</Text>
          <div style={{ marginTop: 4, color: '#555' }}>
            Writing a manual check will <strong>not</strong> automatically apply this payment to those bills. We recommend paying them from the Pay Bills screen instead.
          </div>
        </div>
        <Table
          size="small"
          rowKey={r => r.id}
          loading={openBillsLoading}
          dataSource={openBills}
          pagination={false}
          locale={{ emptyText: 'No open bills' }}
          scroll={{ y: 200 }}
          columns={[
            { title: 'Bill #', dataIndex: 'ref_no', render: (v, r) => v || `#${r.id}` },
            { title: 'Date', dataIndex: 'payment_date', width: 100 },
            { title: 'Due', dataIndex: 'due_date', width: 100, render: d => d || '-' },
            { title: 'Original', dataIndex: 'amount', align: 'right', width: 90, render: a => `${cSym}${fmt(a)}` },
            { title: 'Paid', dataIndex: 'paid_amount', align: 'right', width: 80, render: a => `${cSym}${fmt(a)}` },
            { title: 'Balance Due', key: 'balance', align: 'right', width: 100, render: (_, r) => {
              const bal = Number(r.amount || 0) - Number(r.paid_amount || 0);
              return <Text strong style={{ color: bal > 0 ? '#fa8c16' : undefined }}>{cSym}{fmt(bal)}</Text>;
            } },
            { title: 'Status', dataIndex: 'approval_status', width: 90, render: s => <Tag color={String(s).toLowerCase().includes('partial') ? 'orange' : 'volcano'}>{s || 'Unpaid'}</Tag> },
          ]}
        />
      </Modal>

      {/* Pre-record confirmation when vendor has open bills */}
      <Modal
        title={<><WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />Vendor Has Open Bills</>}
        visible={confirmRecordVisible}
        onCancel={() => { setConfirmRecordVisible(false); setPendingRecordArgs(null); }}
        width={520}
        maskClosable={false}
        footer={[
          <Button key="cancel" onClick={() => { setConfirmRecordVisible(false); setPendingRecordArgs(null); }}>Cancel</Button>,
          <Button key="viewbills" icon={<DollarOutlined />} onClick={() => {
            setConfirmRecordVisible(false);
            setOpenBillsVisible(true);
          }}>View Bills</Button>,
          <Button key="continue" type="primary" onClick={async () => {
            setConfirmRecordVisible(false);
            if (pendingRecordArgs) {
              await recordAndPrint(pendingRecordArgs.values, pendingRecordArgs.saveOnly);
            }
            setPendingRecordArgs(null);
          }}>Continue Writing Check</Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>
            <strong>{openBillsVendorName || 'This vendor'}</strong> has {openBillsCount} unpaid bill{openBillsCount > 1 ? 's' : ''} totaling <strong>{cSym}{fmt(openBillsTotal)}</strong>.
          </Text>
        </div>
        <div style={{ color: '#555' }}>
          Writing a manual check will <strong>not</strong> automatically apply this payment to those bills. The bills will remain unpaid unless you use the Pay Bills / payment allocation workflow.
        </div>
      </Modal>

      <JournalEntryDetailModal
        journalEntryId={journalDetailId}
        visible={!!journalDetailId}
        onClose={() => setJournalDetailId(null)}
      />
    </div>
  );
};

export default CheckPrinting;

