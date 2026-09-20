import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, Select, Row, Col, Divider, Space, message, Tag, Typography, Upload, Statistic, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, CreditCardOutlined, EditOutlined, EyeOutlined, UploadOutlined, BookOutlined, ReloadOutlined, AccountBookOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import { dedupeAccounts, buildAccountLabelMap } from '../../utils/accounts';
import AccountSelect from '../shared/AccountSelect';
import JournalEntryDetailModal from '../accountant/JournalEntryDetailModal';

const { Option } = Select;
const { Text } = Typography;

// Transaction types that represent money going TO the credit card (payments),
// as opposed to charges that increase the card balance.
const PAYMENT_TYPES = new Set(['payment', 'check', 'bill payment', 'transfer_in', 'credit card payment', 'transfer']);

const isPaymentType = (type) => {
  const t = String(type || '').toLowerCase();
  return PAYMENT_TYPES.has(t) || (t.includes('payment') && !t.includes('credit card charge'));
};

// A "charge" is a credit-card activity line that increases the card balance
// (type "Credit Card" / "credit card"). Payment lines must NOT be included.
const isChargeType = (type) => {
  const t = String(type || '').toLowerCase();
  return t.includes('credit') && !isPaymentType(t);
};

// Parse the categories column (comma-separated names OR a JSON array of
// { account / category, description, amount } objects) into account names.
const parseCategories = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(x => (typeof x === 'string' ? x : (x.account || x.category || ''))).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try { return parseCategories(JSON.parse(t)); } catch {}
    }
    return t.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

// Parse the categories column into split lines, round-tripping account ids.
// Handles comma-separated names, a JSON array of strings, or a JSON array of
// { account, account_id, description, amount } objects (current format).
const parseSplitLines = (raw) => {
  const toLine = (x) => {
    if (typeof x === 'string') return { account: x, account_id: undefined, description: '', amount: 0 };
    return {
      account: x.account || x.category || '',
      account_id: x.account_id != null ? Number(x.account_id) : (x.accountId != null ? Number(x.accountId) : undefined),
      description: x.description || '',
      amount: Number(x.amount) || 0,
    };
  };
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(toLine).filter(l => l.account);
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try { return parseSplitLines(JSON.parse(t)); } catch { /* fall through */ }
    }
    return t.split(',').map(s => s.trim()).filter(Boolean).map(account => ({ account, account_id: undefined, description: '', amount: 0 }));
  }
  return [];
};

const CreditCardCharges = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [allTransactions, setAllTransactions] = useState([]);
  const [data, setData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [creditCardAccounts, setCreditCardAccounts] = useState([]);
  const [splitLines, setSplitLines] = useState([{ key: 1, category: '', accountId: undefined, description: '', amount: 0 }]);
  const [addCardModal, setAddCardModal] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [attachedDocs, setAttachedDocs] = useState([]);
  // txId -> [accountId, ...] resolved from the posted GL entry (debit lines)
  const [txAccountIds, setTxAccountIds] = useState({});

  // ── Register filters ──
  const [selectedCardId, setSelectedCardId] = useState(null); // null = All Cards
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment().endOf('month')]);
  const [searchText, setSearchText] = useState('');

  // ── Detail / GL modal ──
  const [viewItem, setViewItem] = useState(null);
  const [viewDetail, setViewDetail] = useState(null);
  const [viewJournal, setViewJournal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [journalDetailId, setJournalDetailId] = useState(null);

  const labelMap = useMemo(() => buildAccountLabelMap(accounts), [accounts]);

  // Resolve each charge's stored category names → full COA hierarchy paths,
  // then supplement with the real GL debit-line accounts (authoritative).
  // Recomputed whenever the chart of accounts or GL map loads so paths always render.
  const dataWithAccounts = useMemo(
    () => data.map(c => {
      const fromCategories = parseCategories(c.categories)
        .map(name => {
          const a = accounts.find(x => (x.accountName || x.name) === name);
          return a ? (labelMap.get(Number(a.id)) || name) : name;
        })
        .filter(Boolean);
      const fromGl = (txAccountIds[Number(c.key)] || [])
        .map(id => labelMap.get(Number(id)) || '')
        .filter(Boolean);
      return { ...c, accountNames: Array.from(new Set([...fromGl, ...fromCategories])) };
    }),
    [data, accounts, labelMap, txAccountIds]
  );

  const splitTotal = useMemo(() => splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [splitLines]);

  const resolveAccountId = (name) => {
    if (!name) return undefined;
    const a = accounts.find(x => (x.accountName || x.name) === name);
    return a ? Number(a.id) : undefined;
  };
  const addSplitLine = () => setSplitLines(prev => [...prev, { key: Date.now(), category: '', accountId: undefined, description: '', amount: 0 }]);
  const removeSplitLine = (key) => setSplitLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  const updateSplitLine = (key, field, value) => setSplitLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  const updateSplitLineAccount = (key, id) => {
    const a = accounts.find(x => Number(x.id) === Number(id));
    setSplitLines(prev => prev.map(l => l.key === key ? {
      ...l,
      category: a ? (a.accountName || a.name) : (l.category || ''),
      accountId: id,
    } : l));
  };

  const loadDocuments = async (linkedId) => {
    try {
      const list = await window.electronAPI.getDocuments('creditcard', String(linkedId));
      setAttachedDocs(Array.isArray(list) ? list : []);
    } catch { setAttachedDocs([]); }
  };

  const openDocument = async (id) => {
    const res = await window.electronAPI.openDocument(id);
    if (!res?.success) message.error(res?.error || 'Unable to open file');
  };

  const deleteDocument = async (id) => {
    const res = await window.electronAPI.deleteDocument(id);
    if (res?.success) {
      setAttachedDocs(prev => prev.filter(d => d.id !== id));
      message.success('File deleted');
    } else {
      message.error(res?.error || 'Delete failed');
    }
  };

  const uploadReceipt = async (linkedId) => {
    const f = fileList && fileList[0];
    if (!f) return;
    const raw = f.originFileObj || f;
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(raw);
    });
    const res = await window.electronAPI.uploadDocument({
      name: f.name || raw.name,
      mime: f.type || raw.type || 'application/octet-stream',
      data: base64,
      category: 'creditcard',
      linkedId,
      enteredBy: 'system',
    });
    if (!res?.success) throw new Error(res?.error || 'Upload failed');
  };

  const handleAddCardAccount = async () => {
    if (!newCardName.trim()) return message.warning('Account name required');
    try {
      await window.electronAPI.insertChartAccount({ name: newCardName.trim(), type: 'Credit Card', status: 'Active', normalBalance: 'Credit', openingBalance: 0 });
      setNewCardName(''); setAddCardModal(false);
      message.success('Credit card account added');
      await loadData();
    } catch { message.error('Failed to add account'); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: 'Delete this charge?',
      content: `Are you sure you want to delete the ${cSym}${Number(record.amount || 0).toFixed(2)} charge on ${record.card}?`,
      okText: 'Delete', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await window.electronAPI.deleteTransaction(record.key);
          if (res?.success || res?.changes > 0) {
            message.success('Charge deleted');
            loadData();
          } else { message.error(res?.error || 'Failed to delete'); }
        } catch (e) { message.error('Failed to delete charge'); }
      },
    });
  };

  const openEdit = async (record) => {
    try {
      const full = await window.electronAPI.getTransaction(record.key);
      if (full) {
        setEditingId(record.key);
        loadDocuments(record.key);
        const split = parseSplitLines(full.categories || record.categories || '');
        const singleAmount = Number(full.amount || record.amount || 0);
        if (split.length > 0) {
          setSplitLines(split.map((s, i) => ({
            key: i,
            category: s.account,
            accountId: s.account_id != null ? s.account_id : resolveAccountId(s.account),
            description: s.description,
            amount: split.length === 1 ? (Number(s.amount) || singleAmount) : Number(s.amount || 0),
          })));
        } else {
          setSplitLines([{ key: 1, category: '', accountId: undefined, description: full.description || '', amount: singleAmount }]);
        }
        form.setFieldsValue({
          date: full.date ? moment(full.date) : moment(),
          creditCardAccount: (() => {
            const ref = full.reference || record.card || '';
            const byName = creditCardAccounts.find(a => (a.accountName || a.name) === ref);
            return byName ? Number(byName.id) : ref;
          })(),
          vendor: full.payee_name || record.vendor || '',
          description: full.description || '',
          amount: split.length === 1 ? (Number(split[0].amount) || singleAmount) : singleAmount,
        });
        setShowModal(true);
      }
    } catch { message.error('Failed to load charge details'); }
  };

  const openView = async (record) => {
    setViewItem(record);
    setViewModal(true);
    setViewLoading(true);
    setViewDetail(null);
    setViewJournal(null);
    try {
      const [detail, journal] = await Promise.all([
        window.electronAPI.getTransaction(record.key),
        window.electronAPI.journalGetBySource?.('transaction', record.key).catch(() => null),
      ]);
      setViewDetail(detail);
      setViewJournal(journal || null);
    } catch {
      message.error('Failed to load charge details');
    } finally {
      setViewLoading(false);
    }
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Card Account', dataIndex: 'card', key: 'card', width: 160 },
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', render: v => v || '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Account', dataIndex: 'accountNames', key: 'accountNames',
      render: (paths) => paths && paths.length
        ? <Space direction="vertical" size={0}>{paths.map((p, i) => <Tag key={i} style={{ fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</Tag>)}</Space>
        : '-',
    },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: a => `${cSym} ${Number(a || 0).toFixed(2)}` },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); openView(r); }} />
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(r); }} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(r); }} />
        </Space>
      ),
    },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [txs, accs, vends] = await Promise.all([
        window.electronAPI.getTransactions(),
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
        window.electronAPI.getAllSuppliers?.().catch(() => []),
      ]);
      setVendors(Array.isArray(vends) ? vends : (vends?.all || vends?.data || []));
      const allAccs = Array.isArray(accs) ? accs : (accs?.data || []);
      setAccounts(dedupeAccounts(allAccs));

      // Only real Credit Card liability accounts belong in the dropdown —
      // matching by name would pull in Income/Expense accounts whose names
      // merely contain "Credit Card" (e.g. "Credit Card Cash Back").
      const ccAccounts = allAccs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        return t.includes('credit card');
      });
      const cards = ccAccounts.length > 0 ? ccAccounts : allAccs;
      setCreditCardAccounts(cards);

      const txList = Array.isArray(txs) ? txs : [];
      setAllTransactions(txList);

      // Only actual charges appear in the register — payments never do.
      const charges = txList.filter(t => isChargeType(t.type));
      const cardNameById = (id) => cards.find(a => Number(a.id) === Number(id))?.accountName || cards.find(a => Number(a.id) === Number(id))?.name || '';
      const cardForTx = (t) => {
        if (t.accountId != null && cardNameById(t.accountId)) {
          return { cardId: Number(t.accountId), card: cardNameById(t.accountId) };
        }
        if (t.reference) {
          const byName = cards.find(a => (a.accountName || a.name) === t.reference);
          if (byName) return { cardId: Number(byName.id), card: byName.accountName || byName.name };
        }
        return { cardId: t.accountId != null ? Number(t.accountId) : null, card: t.reference || '' };
      };

      const rows = charges.map(t => ({
        key: t.id,
        date: t.date,
        ...cardForTx(t),
        vendor: t.payee_name || '',
        description: t.description,
        amount: t.amount || t.credit || 0,
        categories: t.categories || '',
        reference: t.reference || '',
      }));
      setData(rows);

      // Bulk-resolve the real GL expense accounts for each charge.
      const ids = rows.map(r => r.key);
      let glMap = {};
      try {
        const res = await window.electronAPI.journalTransactionAccounts?.(ids);
        if (res && !res.error) glMap = res;
      } catch { /* GL map optional */ }
      // IPC serializes object keys to strings — normalize back to numeric ids.
      const normalized = {};
      Object.keys(glMap).forEach(k => { normalized[Number(k)] = glMap[k]; });
      setTxAccountIds(normalized);
    } catch (err) {
      console.error('Failed to load credit charges', err);
      message.error('Failed to load credit charges');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ── Card selection helpers ──
  const selectedCard = useMemo(
    () => (selectedCardId == null ? null : creditCardAccounts.find(a => Number(a.id) === Number(selectedCardId)) || null),
    [selectedCardId, creditCardAccounts]
  );
  const selectedCardNames = useMemo(
    () => new Set(creditCardAccounts.filter(a => selectedCardId == null || Number(a.id) === Number(selectedCardId)).map(a => a.accountName || a.name).filter(Boolean)),
    [selectedCardId, creditCardAccounts]
  );
  const selectedCardIds = useMemo(
    () => new Set(creditCardAccounts.filter(a => selectedCardId == null || Number(a.id) === Number(selectedCardId)).map(a => Number(a.id))),
    [selectedCardId, creditCardAccounts]
  );
  const isLinkedToSelectedCard = (tx) => {
    const aid = Number(tx.accountId);
    if (aid && selectedCardIds.has(aid)) return true;
    if (tx.reference && selectedCardNames.has(tx.reference)) return true;
    return false;
  };

  // ── Filtered register (respects card, date range, search) ──
  const filtered = useMemo(() => {
    let list = dataWithAccounts;
    if (selectedCardId != null) {
      list = list.filter(c => Number(c.cardId) === Number(selectedCardId) || c.card === (selectedCard?.accountName || selectedCard?.name));
    }
    const [start, end] = dateRange;
    if (start && end) {
      list = list.filter(c => {
        const d = c.date ? moment(c.date) : null;
        return d && d.isBetween(start.startOf('day'), end.endOf('day'), null, '[]');
      });
    }
    const q = (searchText || '').toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.vendor || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.card || '').toLowerCase().includes(q) ||
        (c.reference || '').toLowerCase().includes(q) ||
        (c.key != null && String(c.key).includes(q)) ||
        (c.accountNames || []).some(p => p.toLowerCase().includes(q))
      );
    }
    return list;
  }, [dataWithAccounts, selectedCardId, selectedCard, dateRange, searchText]);

  // ── Summary (respects selected card + date range) ──
  const summary = useMemo(() => {
    const cards = selectedCardId == null ? creditCardAccounts : creditCardAccounts.filter(a => Number(a.id) === Number(selectedCardId));
    const opening = cards.reduce((s, a) => s + (Number(a.openingBalance) || 0), 0);
    const linked = allTransactions.filter(isLinkedToSelectedCard);

    let currentBalance = opening;
    let paymentsThisMonth = 0;
    let chargesThisMonth = 0;
    const [start, end] = dateRange;

    linked.forEach(t => {
      currentBalance += (Number(t.credit) || 0) - (Number(t.debit) || 0);
      const isCharge = isChargeType(t.type);
      const d = t.date ? moment(t.date) : null;
      const inRange = start && end && d && d.isBetween(start.startOf('day'), end.endOf('day'), null, '[]');
      if (!inRange) return;
      if (isCharge) chargesThisMonth += Number(t.amount) || Number(t.credit) || 0;
      else paymentsThisMonth += Number(t.amount) || Number(t.debit) || 0;
    });

    return { currentBalance, chargesThisMonth, paymentsThisMonth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions, creditCardAccounts, selectedCardId, dateRange, selectedCardIds, selectedCardNames]);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setSplitLines([{ key: 1, category: '', accountId: undefined, description: '', amount: 0 }]);
    setFileList([]);
    setAttachedDocs([]);
    setShowModal(true);
  };

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const date = values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      // A lone split line with an account but no amount inherits the top-level
      // amount field so the posted GL always matches the charge.
      const baseLines = splitLines.map(l => ({ ...l, amount: Number(l.amount) || 0 }));
      const canInherit = baseLines.length === 1 && baseLines[0].amount <= 0 && Number(values.amount) > 0 && Boolean(baseLines[0].category || baseLines[0].accountId);
      const lines = canInherit ? [{ ...baseLines[0], amount: Number(values.amount) }] : baseLines;
      const splitTotalAmt = lines.reduce((s, l) => s + l.amount, 0);
      const declaredAmount = Number(values.amount) || 0;
      // Never save a charge whose split lines don't add up to the charge amount.
      if (splitTotalAmt > 0 && declaredAmount > 0 && Math.abs(splitTotalAmt - declaredAmount) > 0.005) {
        form.setFields([{ name: 'amount', errors: [`Split lines total ${cSym}${splitTotalAmt.toFixed(2)} but the charge amount is ${cSym}${declaredAmount.toFixed(2)}`] }]);
        message.error('Split line amounts must total the charge amount');
        return;
      }
      const totalAmount = splitTotalAmt || declaredAmount;
      const splitRows = lines.filter(l => l.amount > 0).map(l => ({
        account: l.category,
        accountId: l.accountId ?? resolveAccountId(l.category),
        account_id: l.accountId ?? resolveAccountId(l.category),
        description: l.description,
        amount: l.amount,
      }));
      const categories = splitRows.length > 0 ? JSON.stringify(splitRows) : lines.filter(l => l.category).map(l => l.category).join(', ');
      const descriptions = lines.filter(l => l.description).map(l => l.description).join('; ');

      const cardAccountName = values.creditCardAccount || values.card || '';
      const cardAccount = creditCardAccounts.find(a => String(a.id) === String(cardAccountName))
        || creditCardAccounts.find(a => (a.accountName || a.name) === cardAccountName);
      const tx = {
        date,
        type: 'Credit Card',
        amount: totalAmount,
        description: descriptions || values.description || '',
        reference: cardAccount ? (cardAccount.accountName || cardAccount.name) : cardAccountName,
        accountId: cardAccount ? Number(cardAccount.id) : undefined,
        entered_by: 'system',
        categories,
        payee_name: values.vendor || '',
        splitLines: splitRows,
      };

      let res;
      let txId = editingId;
      if (editingId) {
        res = await window.electronAPI.updateTransaction(editingId, tx);
        if (res?.success || res?.changes > 0) { message.success('Charge updated'); }
        else { throw new Error(res?.error || 'Failed to update'); }
      } else {
        res = await window.electronAPI.insertTransaction(tx);
        if (!res || (!res.changes && !res.success && !res.id)) { throw new Error('Failed to add charge'); }
        txId = res?.id || res?.lastInsertRowid || res?.result?.lastInsertRowid || null;
        message.success('Credit card charge added');
      }
      if (txId) {
        try {
          await uploadReceipt(txId);
          await loadDocuments(txId);
        } catch (uploadErr) {
          console.error('[attachments] charge attachment upload failed:', uploadErr);
          message.error('The charge was saved, but the attachment could not be stored. Please try attaching the file again.');
        }
      }
      setShowModal(false);
      setEditingId(null);
      form.resetFields();
      setSplitLines([{ key: 1, category: '', accountId: undefined, description: '', amount: 0 }]);
      setFileList([]);
      await loadData();
    } catch (err) {
      message.error(err.message || 'Error saving credit charge');
    } finally {
      setLoading(false);
    }
  };

  const glLines = useMemo(() => (viewJournal?.lines || []).map(l => ({
    key: l.id || `${viewJournal.id}-${l.account_id}`,
    account: l.accountName || (l.account_id != null ? (labelMap.get(Number(l.account_id)) || '') : '') || l.account || '',
    description: l.description || '',
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
  })), [viewJournal, labelMap]);

  // Expense accounts for the view modal: the GL debit lines minus the credit
  // card liability account, falling back to the stored categories.
  const viewExpenseAccounts = useMemo(() => {
    const cardId = viewItem?.cardId;
    const fromGl = (viewJournal?.lines || [])
      .filter(l => (Number(l.debit) || 0) > 0 && (cardId == null || Number(l.account_id) !== Number(cardId)))
      .map(l => l.accountName || (l.account_id != null ? (labelMap.get(Number(l.account_id)) || '') : '') || l.account || '')
      .filter(Boolean);
    const fromCategories = (viewItem?.accountNames || []).filter(Boolean);
    return Array.from(new Set([...fromGl, ...fromCategories]));
  }, [viewJournal, viewItem, labelMap]);

  // The card account id used for "View in General Ledger" navigation.
  const viewCardId = useMemo(() => {
    if (viewItem?.cardId != null) return Number(viewItem.cardId);
    if (viewItem?.card) {
      const byName = creditCardAccounts.find(a => (a.accountName || a.name) === viewItem.card);
      if (byName) return Number(byName.id);
    }
    return null;
  }, [viewItem, creditCardAccounts]);

  const registerTitle = selectedCard ? (selectedCard.accountName || selectedCard.name) : 'All Cards';

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}><CreditCardOutlined style={{ marginRight: 8 }} />Credit Card Charges</span>}
        extra={<Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
        </Space>}
      >
        {/* Toolbar: card filter + date range + search + add */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            style={{ width: 220 }}
            value={selectedCardId == null ? 'all' : selectedCardId}
            onChange={v => setSelectedCardId(v === 'all' ? null : Number(v))}
            showSearch
            optionFilterProp="children"
          >
            <Option value="all">All Cards</Option>
            {creditCardAccounts.map(a => (
              <Option key={a.id} value={a.id}>{a.accountName || a.name}</Option>
            ))}
          </Select>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={r => setDateRange(r || [])}
            format="MM/DD/YYYY"
            allowClear={false}
          />
          <Input.Search
            allowClear
            placeholder="Search vendor, description, account, card, ref/txn #"
            onSearch={v => setSearchText(v)}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 320 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Charge</Button>
        </Space>

        {/* Register header for the selected card */}
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6f6f8', borderRadius: 6, border: '1px solid #e8e8e8' }}>
          <Space>
            <AccountBookOutlined style={{ fontSize: 18, color: '#722ed1' }} />
            <span style={{ fontSize: 17, fontWeight: 700 }}>{registerTitle}</span>
            <Text type="secondary" style={{ fontSize: 13 }}>Credit Card Register</Text>
          </Space>
        </div>

        {/* Summary */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
              <Statistic
                title={`${registerTitle} — Current Balance`}
                value={summary.currentBalance}
                precision={2}
                prefix={cSym}
                valueStyle={{ color: summary.currentBalance < 0 ? '#f5222d' : '#262626' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderTop: '3px solid #fa541c' }}>
              <Statistic title="Charges This Month" value={summary.chargesThisMonth} precision={2} prefix={cSym} valueStyle={{ color: '#fa541c' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
              <Statistic title="Payments This Month" value={summary.paymentsThisMonth} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filtered}
          loading={loading}
          rowKey="key"
          size="middle"
          locale={{ emptyText: <Empty description="No credit card charges for the selected filter." /> }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: t => `${t} charges` }}
          onRow={(r) => ({ onClick: () => openView(r), style: { cursor: 'pointer' } })}
        />
      </Card>

      <Modal
        title={editingId ? 'Edit Credit Card Charge' : 'Add Credit Card Charge'}
        visible={showModal}
        onCancel={() => { setShowModal(false); setEditingId(null); form.resetFields(); setSplitLines([{ key: 1, category: '', accountId: undefined, description: '', amount: 0 }]); setFileList([]); setAttachedDocs([]); }}
        onOk={() => form.submit()}
        okText={editingId ? 'Update Charge' : 'Add Charge'}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} preserve={false}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="date" label="Date" initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="creditCardAccount" label="Credit Card Account" rules={[{ required: true, message: 'Select card account' }]}>
                <AccountSelect accounts={creditCardAccounts} placeholder="Select credit card account"
                  dropdownRender={menu => (<>{menu}<Divider style={{ margin: '4px 0' }} /><div style={{ padding: '4px 8px' }}><Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAddCardModal(true)}>Add New</Button></div></>)} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="vendor" label="Vendor / Payee" rules={[{ required: true, message: 'Select a vendor' }]}>
                <Select placeholder="Select vendor" showSearch optionFilterProp="children" allowClear>
                  {vendors.map(v => (
                    <Option key={v.id} value={v.display_name || `${v.first_name} ${v.last_name}`}>
                      {v.display_name || `${v.first_name} ${v.last_name}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ marginBottom: 16 }}>
            {attachedDocs.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {attachedDocs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 12 }}>{doc.document_name}</span>
                    <Button size="small" type="link" onClick={() => openDocument(doc.id)}>Open</Button>
                    <Button size="small" type="link" danger onClick={() => deleteDocument(doc.id)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
            <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} maxCount={1}>
              <Button icon={<UploadOutlined />} size="small">Attach Receipt</Button>
            </Upload>
          </div>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>Expense Accounts (Split)</Divider>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '0 4px' }}>
              <span style={{ flex: 2, fontSize: 11, fontWeight: 600 }}>Account</span>
              <span style={{ flex: 2, fontSize: 11, fontWeight: 600 }}>Description</span>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>Amount ({cSym})</span>
              <div style={{ width: 32 }} />
            </div>
            {splitLines.map((line) => (
              <div key={line.key} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <AccountSelect size="small" accounts={accounts} placeholder="Account" value={line.accountId ?? resolveAccountId(line.category)} onChange={v => updateSplitLineAccount(line.key, v)} style={{ flex: 2 }} allowClear />
                <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} style={{ flex: 2 }} />
                <InputNumber size="small" min={0} step={0.01} placeholder="Amount" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} style={{ flex: 1 }} />
                {splitLines.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSplitLine(line.key)} />}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Button size="small" type="dashed" onClick={addSplitLine} icon={<PlusOutlined />}>Add Line</Button>
              <span style={{ fontSize: 12, color: '#666' }}>Total: {cSym} {splitTotal.toFixed(2)}</span>
            </div>
          </div>

          {splitLines.length <= 1 && (
            <Form.Item name="amount" label="Amount" rules={[{ required: splitLines.length <= 1, message: 'Enter amount' }]}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix={cSym} />
            </Form.Item>
          )}

          <Form.Item name="description" label="Memo / Description">
            <Input placeholder="Optional overall memo" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add New Credit Card Account Modal */}
      <Modal title="Add Credit Card Account" visible={addCardModal} onOk={handleAddCardAccount}
        onCancel={() => { setAddCardModal(false); setNewCardName(''); }} okText="Add" destroyOnClose>
        <Input placeholder="Credit card account name (e.g. Chase Visa)" value={newCardName} onChange={e => setNewCardName(e.target.value)} onPressEnter={handleAddCardAccount} />
      </Modal>

      {/* View Charge Modal */}
      <Modal
        title={<span><CreditCardOutlined style={{ marginRight: 8 }} />Credit Card Charge</span>}
        visible={viewModal}
        onCancel={() => setViewModal(false)}
        width={640}
        destroyOnClose
        footer={<Space>
          {viewJournal && viewJournal.id && (
            <Button type="primary" icon={<AccountBookOutlined />} onClick={() => setJournalDetailId(viewJournal.id)}>
              View Journal Entry
            </Button>
          )}
          {viewCardId != null && (
            <Button type="primary" icon={<BookOutlined />}
              onClick={() => {
                setViewModal(false);
                const jid = viewJournal && viewJournal.id ? `&journal=${viewJournal.id}` : '';
                history.push(`/main/accountant/general-ledger?account=${viewCardId}${jid}`);
              }}>
              View in General Ledger
            </Button>
          )}
          <Button onClick={() => setViewModal(false)}>Close</Button>
        </Space>}
      >
        {viewLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>Loading...</div>
        ) : (
          <>
            {viewItem && (
              <Row gutter={[12, 12]}>
                <Col span={12}><strong>Credit Card Account:</strong><br />{viewItem.card || '-'}</Col>
                <Col span={12}><strong>Date:</strong><br />{viewItem.date ? moment(viewItem.date).format('MM/DD/YYYY') : '-'}</Col>
                <Col span={12}><strong>Vendor:</strong><br />{viewItem.vendor || '-'}</Col>
                <Col span={12}><strong>Amount:</strong><br /><span style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{cSym} {Number(viewItem.amount || 0).toFixed(2)}</span></Col>
                <Col span={12}><strong>Expense Account:</strong><br />{viewExpenseAccounts.map((p, i) => <Tag key={i} style={{ marginTop: 4 }}>{p}</Tag>)}{!viewExpenseAccounts.length && '-'}</Col>
                <Col span={24}><strong>Description:</strong><br />{viewDetail?.description || viewItem.description || '-'}</Col>
              </Row>
            )}

            <Divider orientation="left" style={{ fontSize: 13 }}>Accounting / GL Entries</Divider>
            {viewJournal ? (
              <div>
                <Space wrap style={{ marginBottom: 8 }} size={16}>
                  <Text type="secondary">Journal #{viewJournal.id}</Text>
                  {viewJournal.reference && <Text type="secondary">Ref: {viewJournal.reference}</Text>}
                  <Text type="secondary">Date: {viewJournal.date ? moment(viewJournal.date).format('MM/DD/YYYY') : '-'}</Text>
                  <Tag color={viewJournal.status === 'Posted' ? 'green' : 'orange'}>{viewJournal.status || 'Posted'}</Tag>
                </Space>
                <Table
                  size="small"
                  rowKey="key"
                  dataSource={glLines}
                  pagination={false}
                  columns={[
                    { title: 'Account', dataIndex: 'account', key: 'account', render: v => v || '-' },
                    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                    { title: 'Debit', dataIndex: 'debit', key: 'debit', align: 'right', render: v => v ? `${cSym} ${Number(v).toFixed(2)}` : '-' },
                    { title: 'Credit', dataIndex: 'credit', key: 'credit', align: 'right', render: v => v ? `${cSym} ${Number(v).toFixed(2)}` : '-' },
                  ]}
                />
              </div>
            ) : (
              <Text type="secondary">No posted GL entry found for this charge.</Text>
            )}
          </>
        )}
      </Modal>

      <JournalEntryDetailModal
        journalEntryId={journalDetailId}
        visible={!!journalDetailId}
        onClose={() => setJournalDetailId(null)}
      />
    </div>
  );
};

export default CreditCardCharges;