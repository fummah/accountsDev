import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Card, Form, Input, Button, DatePicker, Select, message, Divider, Modal,
  Row, Col, InputNumber, Typography, Space, Tag, Tooltip, Collapse, Statistic, Badge, Table
} from 'antd';
import {
  PlusOutlined, MinusCircleOutlined, SaveOutlined,
  FileTextOutlined, DollarOutlined, SwapOutlined,
  PaperClipOutlined, UploadOutlined, ReloadOutlined, DownloadOutlined,
  PrinterOutlined, EyeOutlined, BookOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import COUNTRIES from '../../../utils/countries';
import { phoneInputHandler } from '../../../utils/phone';
import { dedupeAccounts, getBillLineAccounts, BILL_LINE_ACCOUNT_TYPES } from '../../../utils/accounts';
import { getInventoryProducts } from '../../../utils/products';
import AccountSelect from '../../shared/AccountSelect';
import ContactIdentityNote from '../../shared/ContactIdentityNote';
import { deriveDisplayName, identityRule } from '../../../utils/contactIdentity';
import JournalEntryDetailModal from '../../accountant/JournalEntryDetailModal';
import {
  FormSection, FormGrid, FormCol, DocumentActionBar, TotalsBlock, FORM_ITEM_STYLE,
  PAGE_WRAPPER_STYLE,
} from '../../shared/FormSection';

const { Option } = Select;
const { Text } = Typography;
const { Panel } = Collapse;

const TERMS_OPTIONS = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
];

// NOTE: which accounts may appear on a bill line is derived from each
// account's real Type/classification (see utils/accounts.js → isBillLineAccount),
// never from a hand-maintained name list. BILL_LINE_ACCOUNT_TYPES is only used
// to populate the "Add New Account" modal so it offers bill-usable types.

// ── Bill Date + Terms → Due Date ─────────────────────────────────────────
// The ONE shared calculation for this screen. The mount initialiser, the Bill
// Date handler, the Terms handler and the vendor default-terms path all call
// it, so every path produces exactly the same Due Date.
const calculateDueDate = (billDate, terms) => {
  const base = billDate ? moment(billDate) : null;
  if (!base || !base.isValid()) return null;
  const days = Number(terms);
  return base.clone().add(Number.isFinite(days) ? days : 30, 'days');
};

// A vendor's stored terms may be a number (30), a numeric string ("30") or a
// label ("Net 30", "Due on receipt"). Normalise it to a day offset so it can
// drive both the Terms select and the Due Date calculation.
const normalizeTerms = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const exact = Number(s);
  if (Number.isFinite(exact)) return exact;
  if (/receipt|immediate|due\s+now/i.test(s)) return 0;
  const net = s.match(/net\s*(\d{1,3})/i);
  if (net) return Number(net[1]);
  const any = s.match(/\d{1,3}/);
  return any ? Number(any[0]) : null;
};

// ── Bill lines ───────────────────────────────────────────────────────────
// A bill line is one of two shapes, and the Type column switches between them:
//
//   'account' — an account plus a hand-typed amount. This is the original
//               behaviour, and it is what every pre-existing bill line is.
//   'item'    — an inventory product plus quantity x rate. The amount is
//               COMPUTED from qty x rate and is never typed, so the line total
//               can never disagree with the quantity it claims.
//
// The stored value matches what the backend writes (`expense_lines.line_type`),
// and a NULL/legacy value reads as 'account'.
const LINE_ACCOUNT = 'account';
const LINE_ITEM = 'item';

const makeBillLine = (overrides = {}) => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  line_type: LINE_ACCOUNT,
  category: '',
  accountId: undefined,
  productId: undefined,
  description: '',
  quantity: undefined,
  rate: undefined,
  amount: 0,
  warehouseId: undefined,
  ...overrides,
});

const EnterBill = ({ history, location, match }) => {
  const { symbol: cSym } = useCurrency();
  const [vendors, setVendors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  // Accounts that are valid on a BILL LINE (server-filtered via context:'bill').
  const [billAccounts, setBillAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();
  const [accountSubTypes, setAccountSubTypes] = useState({});
  const [selectedAccType, setSelectedAccType] = useState(null);
  const [accountLineKey, setAccountLineKey] = useState(null);
  const [lines, setLines] = useState([makeBillLine()]);
  // Warehouses back the per-line Warehouse select on inventory item lines.
  const [warehouses, setWarehouses] = useState([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState(null);
  // Inline "Add New Inventory Item" modal — the same pattern CreateInvoice and
  // CreateQuote already use, so a new item can be created without leaving the
  // bill (and without a second product form existing anywhere).
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [prodForm] = Form.useForm();
  // The item line that opened the Add New Inventory Item modal, so the created
  // item can be selected back onto it.
  const [productLineKey, setProductLineKey] = useState(null);
  const [journalDetailId, setJournalDetailId] = useState(null);
  const editId = match?.params?.id;
  const isEdit = !!editId;
  const preSelectedVendorId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const vid = params.get('vendor');
    return vid ? Number(vid) : null;
  }, [location.search]);

  // Payment & credit state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [availableCredits, setAvailableCredits] = useState([]);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [payAmount, setPayAmount] = useState(0);
  const [billData, setBillData] = useState(null);
  const [paying, setPaying] = useState(false);
  const [paidCheck, setPaidCheck] = useState(null);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [billDocuments, setBillDocuments] = useState([]);
  const fileInputRef = useRef(null);
  // Vendor id whose default terms have already been applied, so a vendor-list
  // refresh cannot overwrite terms the user picked by hand afterwards.
  const vendorTermsAppliedRef = useRef(null);

  // ── Due Date helpers ──────────────────────────────────────────────────
  // Write the Due Date only when it actually differs from the current value.
  // This is what stops the mount initialiser, the change handlers and the
  // vendor-defaults path from fighting each other (no render/effect loop).
  const applyDueDate = (billDate, terms) => {
    const next = calculateDueDate(billDate, terms);
    if (!next) return;
    const current = form.getFieldValue('dueDate');
    if (current && moment(current).isSame(next, 'day')) return;
    form.setFieldsValue({ dueDate: next });
  };

  const termsOrDefault = (terms) => (terms === null || terms === undefined ? 30 : terms);

  // Bill Date drives Due Date (Due Date = Bill Date + Terms).
  const handleBillDateChange = (val) => {
    applyDueDate(val, form.getFieldValue('terms'));
  };

  // Terms drives Due Date.
  const handleTermsChange = (val) => {
    applyDueDate(form.getFieldValue('billDate'), val);
  };

  // Apply a vendor's stored default payment terms (suppliers.supplier_terms)
  // and recompute the Due Date from them. Only terms representable in the
  // Terms dropdown are applied, so the select can never show a blank value.
  const applyVendorDefaultTerms = (vendor) => {
    if (!vendor) return;
    const days = normalizeTerms(vendor.supplier_terms);
    if (days === null) return;
    if (!TERMS_OPTIONS.some(t => t.value === days)) return;
    if (Number(form.getFieldValue('terms')) === Number(days)) return;
    form.setFieldsValue({ terms: days });
    applyDueDate(form.getFieldValue('billDate'), days);
  };

  // Clear the form and re-apply the Bill Date + Terms → Due Date rule so a
  // freshly cleared screen opens with a calculated Due Date, not a blank one.
  const resetForm = () => {
    form.resetFields();
    setLines([makeBillLine()]);
    const billDate = form.getFieldValue('billDate') || moment();
    applyDueDate(billDate, termsOrDefault(form.getFieldValue('terms')));
  };

  // Cancel never saves. This screen has no unsaved-changes guard today, so
  // Cancel simply returns where the user came from (falling back to the bill
  // tracker) — no new warning system is introduced.
  const handleCancel = () => {
    if (history && history.length > 1) history.goBack();
    else if (history && history.push) history.push('/main/vendors/bills/tracker');
  };

  useEffect(() => {
    loadVendors();
    loadAccounts();
    loadProducts();
    loadBankAccounts();
    loadWarehouses();
    if (editId) loadBill(editId);
  }, [editId]);

  useEffect(() => {
    (async () => {
      try {
        const st = await window.electronAPI.coaGetSubtypes?.();
        if (st && typeof st === 'object') setAccountSubTypes(st);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (preSelectedVendorId && vendors.length > 0 && !editId) {
      const exists = vendors.some(v => v.id === preSelectedVendorId);
      if (exists) {
        form.setFieldsValue({ vendorId: preSelectedVendorId });
        const vendor = vendors.find(v => v.id === preSelectedVendorId);
        if (vendor?.vendor_type === 'Credit Card' || vendor?.vendor_type === 'Loan Lender') {
          message.info(`Vendor type "${vendor.vendor_type}" — if all line accounts use a Credit Card/Loan account, this bill will reclassify the balance to AP instead of recording an expense.`);
        }
        // A pre-selected vendor's default terms drive Terms + Due Date too —
        // but only once per vendor, so reloading the vendor list (Refresh)
        // can't overwrite terms the user has since chosen by hand.
        if (vendorTermsAppliedRef.current !== preSelectedVendorId) {
          vendorTermsAppliedRef.current = preSelectedVendorId;
          applyVendorDefaultTerms(vendor);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors, preSelectedVendorId, editId, form]);

  // Populate Due Date as soon as the screen opens. For a NEW bill the Due Date
  // must be calculated immediately from Bill Date + Terms (previously it stayed
  // blank until Terms was touched by hand). For an EXISTING bill the stored Due
  // Date is authoritative and must NOT be overwritten while the record loads
  // (see loadBill), so this initialiser is skipped in edit mode.
  useEffect(() => {
    if (isEdit) return;
    const billDate = form.getFieldValue('billDate') || moment();
    applyDueDate(billDate, termsOrDefault(form.getFieldValue('terms')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  const loadBill = async (id) => {
    try {
      const data = await window.electronAPI.getSingleExpense?.(id);
      if (data) {
        setBillData(data);
        // NOTE: the stored Due Date is authoritative when editing — it is
        // loaded as-is and never recalculated on mount, so opening a bill can
        // never silently move its due date. Changing Bill Date or Terms later
        // does recalculate it.
        form.setFieldsValue({
          vendorId: data.payee,
          billNumber: data.ref_no,
          billDate: data.payment_date ? moment(data.payment_date) : moment(),
          dueDate: data.due_date ? moment(data.due_date) : null,
          terms: data.terms || 30,
          memo: data.memo || '',
        });
        if (data.lines && data.lines.length > 0) {
          setLines(data.lines.map((l, i) => makeBillLine({
            key: i,
            line_type: l.line_type === LINE_ITEM ? LINE_ITEM : LINE_ACCOUNT,
            category: l.category || '',
            description: l.description || '',
            amount: Number(l.amount) || 0,
            // Carry the stored account id through instead of re-resolving the
            // account by name — account names are not unique across parents.
            accountId: l.account_id != null ? Number(l.account_id) : undefined,
            // Item-line fields. NULL on every historical row, so an old bill
            // opens as account lines exactly as before.
            productId: l.product_id != null ? Number(l.product_id) : undefined,
            quantity: l.quantity != null ? Number(l.quantity) : undefined,
            rate: l.rate != null ? Number(l.rate) : undefined,
            warehouseId: l.warehouse_id != null ? Number(l.warehouse_id) : undefined,
          })));
        }
        // Load attached documents
        try {
          const docs = await window.electronAPI.getDocuments('bill', id);
          setBillDocuments(Array.isArray(docs) ? docs : []);
        } catch { setBillDocuments([]); }
      }
    } catch (e) {
      console.error('Failed to load bill for editing:', e);
      message.error('Failed to load bill details');
    }
  };

  const loadVendors = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setVendors(Array.isArray(data) ? data : (data?.all || data?.data || []));
    } catch (err) {
      console.error('Failed to load vendors', err);
    }
  };

  const loadAccounts = async () => {
    try {
      // Two lists on purpose:
      //   • `accounts`     — every active account. Used to resolve an account id
      //                      for legacy lines, to evaluate the Credit-Card/Loan
      //                      reclassification, and as Parent-Account options.
      //   • `billAccounts` — only accounts valid on a BILL LINE, requested
      //                      server-side via context:'bill'. Because the picker
      //                      (and therefore its search index) is built from this
      //                      list, an Income account can never be surfaced —
      //                      not by browsing and not by searching.
      const [all, billOnly] = await Promise.all([
        window.electronAPI.getChartOfAccounts?.(),
        window.electronAPI.getChartOfAccounts?.({ context: 'bill' }),
      ]);
      setAccounts(Array.isArray(all) ? dedupeAccounts(all.filter(a => a.status === 'Active')) : []);
      setBillAccounts(Array.isArray(billOnly) ? dedupeAccounts(billOnly.filter(a => a.status === 'Active')) : []);
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const data = await window.electronAPI.getAllProducts?.();
      setProducts(Array.isArray(data) ? data : (data?.all || []));
    } catch {}
  };

  const loadBankAccounts = async () => {
    try {
      const accs = await window.electronAPI.getChartOfAccounts?.();
      const list = Array.isArray(accs) ? accs : [];
      setBankAccounts(dedupeAccounts(list.filter(a => ['Bank', 'Cash', 'bank', 'cash'].includes(a.accountType || a.type || ''))));
    } catch {}
  };

  // Warehouses drive the per-line Warehouse select. The default (flagged by
  // isDefault, else the lowest id — see Warehouses.getDefault()) is preselected
  // so the common single-warehouse case needs no interaction at all.
  const loadWarehouses = async () => {
    try {
      const list = await window.electronAPI.getWarehouses?.();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      setWarehouses(arr);
      const def = arr.find(w => Number(w.isDefault) === 1) || arr[0];
      setDefaultWarehouseId(def ? Number(def.id) : null);
    } catch { setWarehouses([]); }
  };

  const handleAddSupplier = async () => {
    try {
      const vals = await supplierForm.validateFields();
      // Shared rule: explicit -> personal name -> company. `'New Supplier'` is
      // gone — the validator above already refuses a record with neither field.
      // This form names the company field `company`, hence the alias.
      const display = deriveDisplayName({
        first_name: vals.first_name,
        last_name: vals.last_name,
        company_name: vals.company,
      });
      // Arguments are POSITIONAL and there are 31 of them. This call used to
      // pass only 26, which silently shifted every address field one slot left
      // (the street address landed in `website`) and left `notes`/`vendor_type`
      // undefined. Keep one argument per parameter, in order.
      //
      // The trailing tax trio is explicit: this is a QUICK-ADD that captures
      // only identity + address, so the vendor gets the column defaults —
      // taxable, no default rate. Passing them explicitly (rather than stopping
      // short) keeps the positional contract auditable; the full Add/Edit Vendor
      // forms are where a Default Tax Rate is chosen.
      const res = await window.electronAPI.insertSupplier?.(
        /* title */ '', vals.first_name || '', /* middle_name */ '', vals.last_name || '',
        /* suffix */ '', vals.email || '', display,
        /* company_name */ vals.company || '', /* phone_number */ vals.phone || '',
        /* mobile_number */ '', /* fax */ '', /* other */ '', /* website */ '',
        /* address1 */ vals.address1 || '', /* address2 */ vals.address2 || '',
        /* city */ vals.city || '', /* state */ vals.state || '',
        /* postal_code */ vals.postal_code || '', /* country */ vals.country || '',
        /* supplier_terms */ '', /* business_number */ '', /* account_number */ '',
        /* expense_category */ '', /* opening_balance */ 0, /* as_of */ null,
        /* entered_by */ 'system', /* notes */ '', /* vendor_type */ 'Regular',
        /* taxable */ true, /* default_tax_rate */ null, /* default_tax_rate_id */ null
      );
      if (res && res.error) { message.error(res.error); return; }
      if (res && res.success === false) { message.error('Failed to add supplier'); return; }
      message.success('Supplier added');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
      loadVendors();
    } catch (e) {
      if (!e?.errorFields) message.error('Failed to add supplier');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
    }
  };

  const handleOpenDocument = async (doc) => {
    if (!doc) return;
    try {
      await window.electronAPI.openDocument(doc.id);
    } catch (e) {
      console.error('Failed to open document:', e);
      message.error('Could not open file');
    }
  };

  const addLine = () => setLines(prev => [...prev, makeBillLine()]);
  const removeLine = (key) => { if (lines.length > 1) setLines(prev => prev.filter(l => l.key !== key)); };

  // One place recomputes a line's amount, so an item line's total can never
  // drift from its quantity x rate.
  const recomputeAmount = (line) =>
    line.line_type === LINE_ITEM
      ? (Number(line.quantity) || 0) * (Number(line.rate) || 0)
      : (Number(line.amount) || 0);

  const updateLine = (key, field, value) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    const next = { ...l, [field]: value };
    next.amount = recomputeAmount(next);
    return next;
  }));

  // Switching Type must not leave the other shape's values behind, or a line
  // could submit an item AND an account at once.
  const setLineType = (key, type) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    if (type === LINE_ITEM) {
      return { ...l, line_type: LINE_ITEM, category: '', accountId: undefined, amount: recomputeAmount({ ...l, line_type: LINE_ITEM }) };
    }
    return {
      ...l, line_type: LINE_ACCOUNT,
      productId: undefined, quantity: undefined, rate: undefined, warehouseId: undefined,
    };
  }));

  // Resolve an account id from its name (for legacy bill lines stored as names)
  const resolveAccountId = (name) => {
    if (!name) return undefined;
    const a = accounts.find(x => (x.accountName || x.name) === name);
    return a ? Number(a.id) : undefined;
  };

  // Select by account ID; keep both the name (category) and the unique ID.
  const updateLineAccount = (key, id) => {
    const a = accounts.find(x => Number(x.id) === Number(id));
    setLines(prev => prev.map(l => l.key === key ? {
      ...l,
      category: a ? (a.accountName || a.name) : (l.category || ''),
      accountId: id,
    } : l));
  };

  // Pick the inventory product for an item line.
  //
  // The Rate is deliberately NOT prefilled from products.price: that column is
  // the SELLING price, and this is a purchase. Prefilling it would silently
  // overstate both the inventory value and the AP balance with a number the
  // user never chose, so the rate starts empty and must be typed.
  const selectLineItem = (key, productId) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    if (productId == null) {
      return { ...l, productId: undefined, description: '', amount: recomputeAmount({ ...l, productId: undefined, description: '' }) };
    }
    const prod = products.find(p => Number(p.id) === Number(productId));
    const next = {
      ...l,
      productId: Number(productId),
      description: prod ? (prod.description || prod.name || '') : l.description,
      quantity: l.quantity != null ? l.quantity : 1,
      warehouseId: l.warehouseId != null ? l.warehouseId : (defaultWarehouseId ?? undefined),
    };
    next.amount = recomputeAmount(next);
    return next;
  }));

  const totalAmount = lines.reduce((s, l) => s + recomputeAmount(l), 0);
  const paidAmount = Number(billData?.paid_amount) || 0;
  const remaining = totalAmount - paidAmount;

  const handleSubmit = async (values) => {
    if (totalAmount <= 0) return message.warning('Bill must have at least one line with an amount');
    // An inventory line is a quantity AND a rate — never one without the other.
    // The rate is not prefilled, so it is easy to leave blank; catching it here
    // keeps a $0 inventory line (which would silently post nothing to Inventory
    // Asset while still being saved) out of the ledger.
    const itemLineMissingItem = lines.find(l => l.line_type === LINE_ITEM && (Number(l.quantity) || 0) > 0 && l.productId == null);
    if (itemLineMissingItem) return message.warning('Select an item for the inventory line');
    const itemLineMissingRate = lines.find(l => l.line_type === LINE_ITEM && (Number(l.quantity) || 0) > 0 && !(Number(l.rate) > 0));
    if (itemLineMissingRate) return message.warning('An inventory item line needs a quantity and a rate');
    try {
      setLoading(true);
      const payee = values.vendorId;
      const payment_account = 'Accounts Payable';
      const payment_date = values.billDate ? values.billDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const due_date = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null;
      const payment_method = 'bill';
      const ref_no = values.billNumber || '';
      const category = 'bill';
      const entered_by = 'system';
      const approval_status = 'Unpaid';
      const memo = values.memo || '';
      const terms = values.terms || 30;
      const expenseLines = lines.filter(l => recomputeAmount(l) > 0).map(l => {
        const isItem = l.line_type === LINE_ITEM;
        return {
          line_type: isItem ? LINE_ITEM : LINE_ACCOUNT,
          category: l.category || (isItem ? 'Inventory' : 'General'),
          description: l.description || '',
          amount: recomputeAmount(l),
          // An item line's account is Inventory Asset. The backend resolves it
          // authoritatively too, so the accounting is correct either way.
          accountId: isItem ? (l.accountId ?? undefined) : (l.accountId ?? resolveAccountId(l.category)),
          product_id: isItem ? Number(l.productId) : null,
          quantity: isItem ? (Number(l.quantity) || 0) : null,
          rate: isItem ? (Number(l.rate) || 0) : null,
          warehouse_id: isItem
            ? (l.warehouseId != null ? Number(l.warehouseId) : (defaultWarehouseId ?? null))
            : null,
        };
      });

      let res;
      if (isEdit) {
        res = await window.electronAPI.updateExpense({ id: Number(editId), payee, payment_account, ref_no, category, payment_method, entered_by, payment_date, approval_status, memo, due_date, terms, lines: expenseLines });
      } else {
        res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines, due_date, memo, terms);
      }
      if (res && res.success) {
        // Upload file attachment if present
        const expenseId = Number(res.expenseId || res.id || editId || (res.result && res.result.lastInsertRowid) || 0);
        if (selectedFile && expenseId > 0) {
          try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('FileReader failed'));
              reader.readAsDataURL(selectedFile);
            });
            const uploadRes = await window.electronAPI.uploadDocument({
              name: selectedFile.name,
              mime: selectedFile.type || 'application/octet-stream',
              data: base64,
              category: 'bill',
              linkedId: expenseId,
              enteredBy: 'system',
            });
            if (!uploadRes?.success) {
              console.error('[attachments] bill attachment upload failed:', uploadRes?.error);
              message.error('The bill was saved, but the attachment could not be stored. Please try attaching the file again.');
            }
          } catch (uploadErr) {
            console.error('[attachments] bill attachment upload threw:', uploadErr);
            message.error('The bill was saved, but the attachment could not be stored. Please try attaching the file again.');
          }
        }
        message.success(isEdit ? 'Bill updated' : 'Bill saved — recorded as Accounts Payable');
        if (!isEdit) {
          resetForm();
          setSelectedFile(null);
          setBillDocuments([]);
        }
        if (history && history.push) history.push('/main/vendors/bills/tracker');
      } else {
        message.error(res?.error || 'Failed to save bill');
      }
    } catch (err) {
      console.error('Create bill error', err);
      message.error('Failed to save bill');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    try {
      const vals = await accountForm.validateFields();
      const payload = {
        name:             vals.accountName,
        type:             vals.accountType || 'Expense',
        subType:          vals.subType || null,
        number:           vals.accountCode || null,
        description:      vals.description || '',
        status:           vals.status || 'Active',
        normalBalance:    vals.normalBalance || undefined,
        openingBalance:   Number(vals.openingBalance) || 0,
        taxLine:          vals.taxLine || null,
        parentId:         vals.parentId || null,
        entered_by:       'system',
      };
      const res = await window.electronAPI.insertChartAccount(payload);
      if (res?.success) {
        message.success('Account created');
        if (accountLineKey != null) {
          const newId = res?.account?.id || res?.id || res?.data?.id;
          updateLine(accountLineKey, 'category', vals.accountName);
          if (newId != null) updateLine(accountLineKey, 'accountId', Number(newId));
        }
        setAccountModalOpen(false);
        accountForm.resetFields();
        setSelectedAccType(null);
        setAccountLineKey(null);
        loadAccounts();
      } else {
        message.error(res?.error || 'Failed to create account');
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create account'); }
  };

  // ── Add New Inventory Item ────────────────────────────────────────────────
  // Reuses the SAME inline product modal shape CreateInvoice/CreateQuote use,
  // so there is exactly one way to create a product from a document screen and
  // no second product form to keep in step. On success the new item is
  // auto-selected on the line that opened the modal.
  const handleAddProduct = async () => {
    try {
      const vals = await prodForm.validateFields();
      const res = await window.electronAPI.insertProduct?.(
        vals.type || 'Product', vals.name || '', vals.sku || '', vals.category || '',
        vals.description || '', Number(vals.price) || 0,
        '', '', '', '', 'system', Number(vals.stock) || 0, null
      );
      if (res && res.success === false) { message.error(res?.error || 'Failed to add item'); return; }
      message.success('Item added');
      setProdModalOpen(false);
      prodForm.resetFields();
      const p = await window.electronAPI.getAllProducts?.();
      const arr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(arr);
      const newProd = arr.find(pr => (pr.name || '') === (vals.name || ''));
      if (newProd && productLineKey != null) selectLineItem(productLineKey, newProd.id);
      setProductLineKey(null);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add item'); }
  };

  // ── Payment & Credit ──────────────────────────────────────────────
  const openPayModal = async () => {
    const vendorId = form.getFieldValue('vendorId');
    setPayAmount(remaining > 0 ? remaining : totalAmount);
    setSelectedCredit(null);
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.id != null ? Number(bankAccounts[0].id) : (bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined),
      amount: remaining > 0 ? remaining : totalAmount,
    });
    if (vendorId) {
      try {
        const credits = await window.electronAPI.vendorCreditsAvailable(vendorId);
        setAvailableCredits(Array.isArray(credits) ? credits : []);
      } catch { setAvailableCredits([]); }
    }
    setPayModalOpen(true);
  };

  const handlePayBill = async (values) => {
    if (!editId) return;
    try {
      setPaying(true);
      let creditAmt = 0;
      if (selectedCredit) {
        creditAmt = Math.min(selectedCredit.remaining_amount, payAmount);
        const creditRes = await window.electronAPI.vendorCreditsApply(selectedCredit.id, Number(editId), creditAmt);
        if (!creditRes?.success) message.warning(creditRes?.error || 'Failed to apply credit');
      }
      const cashAmount = payAmount - creditAmt;
      let checkResult = null;
      if (cashAmount > 0.005) {
        const res = await window.electronAPI.billPay({
          expenseId: Number(editId),
          amount: cashAmount,
          paymentDate: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
          bankAccount: values.bankAccount,
        });
        if (!res?.success) {
          message.error(res?.error || 'Failed to pay bill');
          return;
        }
        if (res.check) checkResult = res.check;
      }
      setPayModalOpen(false);
      payForm.resetFields();
      setSelectedCredit(null);
      await loadBill(editId);
      if (checkResult) {
        setPaidCheck(checkResult);
        setPrintModalVisible(true);
      } else {
        message.success('Payment recorded');
      }
    } catch (err) {
      message.error('Failed to process payment');
    } finally { setPaying(false); }
  };

  const handlePrintNow = () => {
    setPrintModalVisible(false);
    if (paidCheck) {
      history.push(`/main/accountant/check-printing?checkId=${paidCheck.id || ''}`);
    }
  };

  const handlePrintLater = () => {
    setPrintModalVisible(false);
    setPaidCheck(null);
    message.success('Check saved. Print later from Check Printing screen.');
  };

  // Bill-line accounts only. Revenue (Income / Other Income) accounts are
  // excluded by the account's classification, never by its name, so an account
  // called "Egg Sales" is filtered out while an expense called "Loan Fees"
  // stays in. The client-side guard keeps the guarantee even if the backend
  // response arrives unfiltered (e.g. an older main process).
  const allAccounts = getBillLineAccounts(billAccounts.length ? billAccounts : accounts);
  // Only inventory-tracking products may appear on an item line. A Service is
  // never offered, and an unclassified product fails safe to "not inventory"
  // (see utils/products.js), so a service can never move stock from a bill.
  const inventoryItems = getInventoryProducts(products);
  const isPaid = billData && (billData.approval_status || '').toLowerCase() === 'paid';

  const openPaidJournal = async () => {
    if (!editId) return;
    try {
      const res = await window.electronAPI.journalGetBySource?.('bill_payment', Number(editId));
      if (res && !res.error && res.id) setJournalDetailId(res.id);
      else message.info('No journal entry posted for this bill payment');
    } catch { message.error('Failed to load journal entry'); }
  };

  const vendorName = vendors.find(v => v.id === form.getFieldValue('vendorId'))?.display_name || '';
  const vendorType = vendors.find(v => v.id === form.getFieldValue('vendorId'))?.vendor_type || '';
  // Check if this looks like a Credit Card / Loan Reclassification
  const looksLikeReclassification = (() => {
    if (vendorType !== 'Credit Card' && vendorType !== 'Loan Lender') return false;
    let hasValidLine = false;
    for (const line of lines) {
      const amt = Number(line.amount) || 0;
      if (amt <= 0) continue;
      if (!line.category) return false;
      const acct = accounts.find(a => (a.accountName || a.name) === line.category);
      const acctType = acct ? (acct.accountType || acct.type) : '';
      if (acctType !== 'Credit Card' && acctType !== 'Loan') return false;
      hasValidLine = true;
    }
    return hasValidLine;
  })();

  // Type | Item/Account | Description | Qty | Rate | Amount | Warehouse | Actions
  //
  // Qty / Rate / Warehouse belong to an item line only, and Amount is read-only
  // there (computed from qty × rate) so a line's total can never disagree with
  // the quantity it claims. On an account line the shape is exactly what it was
  // before: an account picker and a typed amount.
  const dash = <span style={{ color: '#bfbfbf' }}>—</span>;
  const lineColumns = [
    {
      title: 'Type', key: 'type', width: 130,
      render: (_, r) => (
        <Select size="small" style={{ width: '100%' }}
          value={r.line_type || LINE_ACCOUNT}
          onChange={v => setLineType(r.key, v)}>
          <Option value={LINE_ACCOUNT}>Account</Option>
          <Option value={LINE_ITEM}>Inventory Item</Option>
        </Select>
      ),
    },
    {
      title: 'Item / Account', key: 'target', width: 230,
      render: (_, r) => (r.line_type === LINE_ITEM ? (
        <Select size="small" showSearch allowClear optionFilterProp="children"
          style={{ width: '100%' }} placeholder={inventoryItems.length ? 'Select item' : 'No inventory items'}
          value={r.productId != null ? Number(r.productId) : undefined}
          onChange={v => selectLineItem(r.key, v)}
          dropdownRender={menu => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" size="small" icon={<PlusOutlined />} onClick={() => { setProductLineKey(r.key); setProdModalOpen(true); }} style={{ width: '100%', textAlign: 'left' }}>Add New Inventory Item</Button></>)}>
          {inventoryItems.map(p => (
            <Option key={p.id} value={Number(p.id)}>{p.name || p.description}{p.sku ? ` (${p.sku})` : ''}</Option>
          ))}
        </Select>
      ) : (
        <AccountSelect
          style={{ width: '100%' }}
          accounts={allAccounts}
          value={r.accountId ?? resolveAccountId(r.category)}
          onChange={(v) => updateLineAccount(r.key, v)}
          placeholder="Select account"
          dropdownRender={menu => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" size="small" icon={<PlusOutlined />} onClick={() => { setAccountLineKey(r.key); setAccountModalOpen(true); }} style={{ width: '100%', textAlign: 'left' }}>Add New Account</Button></>)}
        />
      )),
    },
    {
      title: 'Description', key: 'desc',
      render: (_, r) => (
        <Input size="small" value={r.description} placeholder="Description"
          onChange={e => updateLine(r.key, 'description', e.target.value)} />
      ),
    },
    {
      title: 'Qty', key: 'qty', width: 80,
      render: (_, r) => (r.line_type === LINE_ITEM
        ? <InputNumber size="small" min={0} step={1} style={{ width: '100%' }} value={r.quantity}
            onChange={v => updateLine(r.key, 'quantity', v)} />
        : dash),
    },
    {
      title: `Rate (${cSym})`, key: 'rate', width: 110,
      render: (_, r) => (r.line_type === LINE_ITEM
        ? <InputNumber size="small" min={0} step={0.01} style={{ width: '100%' }} value={r.rate}
            placeholder="0.00" onChange={v => updateLine(r.key, 'rate', v)} />
        : dash),
    },
    {
      title: `Amount (${cSym})`, key: 'amount', width: 130,
      render: (_, r) => (r.line_type === LINE_ITEM
        // Computed — never typed, so it cannot disagree with qty × rate.
        ? <span style={{ fontWeight: 500 }}>{cSym} {(Number(r.amount) || 0).toFixed(2)}</span>
        : <InputNumber size="small" min={0} step={0.01} style={{ width: '100%' }} value={r.amount}
            onChange={v => updateLine(r.key, 'amount', v || 0)}
            formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={v => v.replace(/,/g, '')} />),
    },
    {
      title: 'Warehouse', key: 'warehouse', width: 150,
      render: (_, r) => (r.line_type === LINE_ITEM
        ? <Select size="small" style={{ width: '100%' }}
            value={r.warehouseId != null ? Number(r.warehouseId) : (defaultWarehouseId ?? undefined)}
            placeholder={warehouses.length ? 'Select warehouse' : 'No warehouses'}
            onChange={v => updateLine(r.key, 'warehouseId', v)}>
            {warehouses.map(w => <Option key={w.id} value={Number(w.id)}>{w.name}</Option>)}
          </Select>
        : dash),
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_, r) => (
        <Tooltip title="Remove">
          <Button size="small" danger icon={<MinusCircleOutlined />}
            onClick={() => removeLine(r.key)} disabled={lines.length <= 1} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />{isEdit ? 'Edit Bill' : 'Enter Bill'}</span>}
        extra={<Space><Button icon={<DownloadOutlined />} onClick={() => {}}>Export</Button><Button icon={<ReloadOutlined />} onClick={loadVendors}>Refresh</Button></Space>}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #1890ff' }}><Statistic title="Total Lines" value={lines.length} valueStyle={{ color: '#1890ff', fontSize: 18 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #52c41a' }}><Statistic title="Total Amount" value={totalAmount} prefix={cSym} precision={2} valueStyle={{ color: '#52c41a', fontSize: 18 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #722ed1' }}><Statistic title="Vendor" value={vendorName || '—'} valueStyle={{ fontSize: 14 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #fa8c16' }}><Statistic title="Status" value={isPaid ? 'Paid' : isEdit ? 'Unpaid' : 'New'} valueStyle={{ color: isPaid ? '#52c41a' : '#fa8c16', fontSize: 16 }} /></Card></Col>
        </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ billDate: moment(), terms: 30 }}>
        <FormSection title="Bill Details" icon={<FileTextOutlined />}>
          <FormGrid>
            <FormCol>
              <Form.Item name="vendorId" label="Vendor" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select a vendor' }]}>
                <Select showSearch optionFilterProp="children" placeholder="Vendor"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>New Vendor</Button></>)}
                  onChange={(v) => {
                    const selected = vendors.find(x => x.id === v);
                    const vt = selected?.vendor_type;
                    if (vt === 'Credit Card' || vt === 'Loan Lender') {
                      message.info(`Vendor type "${vt}" — if all line accounts use a Credit Card/Loan account, this bill will reclassify the balance to AP instead of recording an expense.`);
                    }
                    // The vendor's default terms (suppliers.supplier_terms) set
                    // Terms and recompute Due Date.
                    applyVendorDefaultTerms(selected);
                  }}>
                  {vendors.map(v => (
                    <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name} ${v.last_name}`}</Option>
                  ))}
                </Select>
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item name="billNumber" label="Bill #" style={FORM_ITEM_STYLE}>
                <Input placeholder="INV-001" />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item name="terms" label="Terms" style={FORM_ITEM_STYLE}>
                <Select onChange={handleTermsChange}>
                  {TERMS_OPTIONS.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                </Select>
              </Form.Item>
            </FormCol>

            <FormCol>
              <Form.Item name="billDate" label="Bill Date" style={FORM_ITEM_STYLE} rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" onChange={handleBillDateChange} />
              </Form.Item>
            </FormCol>
            <FormCol>
              {/* Bill Date + Terms → Due Date, via the one shared calculation. */}
              <Form.Item name="dueDate" label="Due Date" style={FORM_ITEM_STYLE}>
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item name="memo" label="Memo" style={FORM_ITEM_STYLE}>
                <Input placeholder="Internal memo..." />
              </Form.Item>
            </FormCol>
          </FormGrid>
        </FormSection>

        <FormSection title="Attachments" icon={<PaperClipOutlined />}>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            setSelectedFile(file || null);
          }} />
          <Space wrap style={{ marginBottom: 8 }}>
            <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Select File</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>Vendor invoice file</Text>
            {selectedFile && <Tag closable onClose={() => setSelectedFile(null)}>{selectedFile.name}</Tag>}
          </Space>
          {billDocuments.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {billDocuments.map(doc => (
                <Tag key={doc.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenDocument(doc)}>
                  <EyeOutlined style={{ marginRight: 4 }} />{doc.document_name || doc.file_path || doc.random_number || 'View File'}
                </Tag>
              ))}
            </div>
          )}
        </FormSection>

        <FormSection title="Line Items" icon={<DollarOutlined />}>
          <div style={{ marginBottom: 12 }}>
            {/* Type | Item/Account | Description | Qty | Rate | Amount | Warehouse | Actions.
                Driven by React state rather than Form.Item, so it can sit inside
                the surrounding <Form> without registering fields. */}
            <Table
              size="small"
              rowKey="key"
              columns={lineColumns}
              dataSource={lines}
              pagination={false}
              scroll={{ x: 1080 }}
              style={{ marginBottom: 8 }}
            />
            <Button type="dashed" onClick={addLine} block icon={<PlusOutlined />} style={{ borderRadius: 6 }}>
              Add Line
            </Button>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
              An <strong>Inventory Item</strong> line moves stock and debits Inventory Asset; its Amount is
              quantity × rate. An <strong>Account</strong> line debits the account you pick.
            </Text>
          </div>

          {/* Total & Payment Status — values unchanged, laid out for scanning. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              {looksLikeReclassification && (
                <div style={{ marginBottom: 6 }}>
                  <Tag color="purple" style={{ fontSize: 11 }}><SwapOutlined /> Credit Card / Loan Reclassification — DR Credit Card/Loan / CR Accounts Payable</Tag>
                </div>
              )}
              {isPaid ? (
                <Space>
                  <Tag color="green">PAID</Tag>
                  <Button type="link" size="small" icon={<BookOutlined />} onClick={openPaidJournal}>View Journal Entry</Button>
                </Space>
              ) : (
                <Tag color="orange">Unpaid — creates Accounts Payable</Tag>
              )}
            </div>
            <TotalsBlock
              rows={[
                { label: 'Total', value: `${cSym} ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, strong: true },
                isEdit && paidAmount > 0 ? { label: 'Paid', value: `${cSym} ${paidAmount.toFixed(2)}`, color: '#52c41a' } : null,
                isEdit && paidAmount > 0 && remaining > 0.005 ? { label: 'Remaining', value: `${cSym} ${remaining.toFixed(2)}`, color: '#fa8c16' } : null,
              ]}
            />
          </div>
        </FormSection>

        <FormSection title="Actions" icon={<SaveOutlined />}>
          <DocumentActionBar
            left={<>
              <Button size="large" onClick={handleCancel}>Cancel</Button>
              <Button onClick={resetForm}>Clear</Button>
            </>}
          >
            {isEdit && !isPaid && (
              <Button icon={<DollarOutlined />} size="large" onClick={openPayModal}>
                Record Payment
              </Button>
            )}
            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large">
              {isEdit ? 'Update Bill' : 'Save Bill'}
            </Button>
          </DocumentActionBar>
        </FormSection>
      </Form>

      {/* Available Credits (when editing) */}
      {isEdit && availableCredits.length > 0 && (
        <Collapse style={{ marginTop: 8 }} ghost>
          <Panel header={<span style={{ fontSize: 12 }}><SwapOutlined /> Vendor Credits Available ({availableCredits.length})</span>} key="credits">
            {availableCredits.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span>{c.reference || `Credit #${c.id}`}</span>
                <Text strong>{cSym} {Number(c.remaining_amount).toFixed(2)}</Text>
              </div>
            ))}
          </Panel>
        </Collapse>
      )}

      <Modal title="Add New Vendor" visible={supplierModalOpen} onOk={handleAddSupplier} onCancel={() => { setSupplierModalOpen(false); supplierForm.resetFields(); }} okText="Add" destroyOnClose width={520}>
        <Form form={supplierForm} layout="vertical" preserve={false}>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}><Form.Item name="first_name" label="First Name" rules={identityRule(supplierForm, 'company')}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="last_name" label="Last Name"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="company" label="Company"><Input /></Form.Item></Col>
          </Row>
          <ContactIdentityNote style={{ marginTop: -4 }} />
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={8}><Form.Item name="phone" label="Phone"><Input onChange={e => supplierForm.setFieldsValue({ phone: phoneInputHandler(e.target.value) })} /></Form.Item></Col>
            <Col span={8}><Form.Item name="address1" label="Street Address"><Input placeholder="123 Main St" /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}><Form.Item name="address2" label="Address Line 2"><Input placeholder="Suite 100" /></Form.Item></Col>
            <Col span={8}><Form.Item name="city" label="City"><Input placeholder="New York" /></Form.Item></Col>
            <Col span={8}><Form.Item name="state" label="State"><Input placeholder="NY" /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="postal_code" label="ZIP / Postal Code"><Input placeholder="10001" /></Form.Item></Col>
            <Col span={12}><Form.Item name="country" label="Country"><Select showSearch placeholder="Select country" allowClear optionFilterProp="children">{COUNTRIES.map(c => <Option key={c} value={c}>{c}</Option>)}</Select></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* Add New Inventory Item — the same inline shape CreateInvoice/CreateQuote
          use, so a bill can create an item without leaving the screen. */}
      <Modal title="Add New Inventory Item" visible={prodModalOpen} onOk={handleAddProduct}
        onCancel={() => { setProdModalOpen(false); prodForm.resetFields(); setProductLineKey(null); }}
        okText="Add" destroyOnClose width={620}>
        <Form form={prodForm} layout="vertical" preserve={false} initialValues={{ type: 'Product' }}>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="type" label="Type" rules={[{ required: true }]}>
                <Select>
                  <Option value="Product">Product</Option>
                  <Option value="Service">Service</Option>
                  <Option value="Raw Material">Raw Material</Option>
                  <Option value="Asset">Asset</Option>
                  <Option value="Bundle">Bundle</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name required' }]}>
                <Input placeholder="e.g. Large Eggs" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="sku" label="SKU">
                <Input placeholder="e.g. EGG-L" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Input placeholder="e.g. Dairy" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="price" label={`Selling price (${cSym})`}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock" label="Opening stock">
                <InputNumber style={{ width: '100%' }} min={0} step={1} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <strong>Service</strong> items never move stock. Product, Raw Material, Asset and Bundle are
            inventory items and can be billed with a quantity and rate.
          </Text>
        </Form>
      </Modal>

      <Modal title="New Account" visible={accountModalOpen} onOk={handleAddAccount} onCancel={() => { setAccountModalOpen(false); accountForm.resetFields(); setSelectedAccType(null); setAccountLineKey(null); }} okText="Create" width={700} destroyOnClose>
        <Form form={accountForm} layout="vertical" preserve={false} initialValues={{ status: 'Active', openingBalance: 0, normalBalance: 'Debit', accountType: 'Expense' }}>
          {/* Row 1: Type / Sub-Type / Account # */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
            <Form.Item name="accountType" label="Account Type" rules={[{ required: true, message: 'Required' }]} style={{ flex: 1 }}>
              <Select placeholder="Select type" showSearch onChange={(v) => {
                setSelectedAccType(v);
                // Only bill-usable types are offered, so the credit-normal set
                // is Liability / Equity / Credit Card / Loan.
                accountForm.setFieldsValue({ normalBalance: (v === 'Liability' || v === 'Equity' || v === 'Credit Card' || v === 'Loan') ? 'Credit' : 'Debit', subType: undefined });
              }}>
                {BILL_LINE_ACCOUNT_TYPES.map(t => <Option key={t} value={t}>{t}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="subType" label="Sub-Type" style={{ flex: 1 }}>
              <Select placeholder="Select sub-type" allowClear showSearch>
                {(accountSubTypes[selectedAccType] || []).map(st => <Option key={st} value={st}>{st}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="accountCode" label="Account #" style={{ flex: 0.7 }}>
              <Input placeholder="e.g., 6010" />
            </Form.Item>
          </div>
          {/* Row 2: Name / Status */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="accountName" label="Account Name" rules={[{ required: true, message: 'Required' }]} style={{ flex: 2 }}>
              <Input placeholder="e.g., Office Supplies" />
            </Form.Item>
            <Form.Item name="status" label="Status" style={{ flex: 1 }}>
              <Select>
                <Option value="Active"><Badge status="success" /> Active</Option>
                <Option value="Inactive"><Badge status="default" /> Inactive</Option>
              </Select>
            </Form.Item>
          </div>
          {/* Row 3: Opening Bal / Normal Bal / Tax Line */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="openingBalance" label="Opening Balance" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} />
            </Form.Item>
            <Form.Item name="normalBalance" label="Normal Balance" style={{ flex: 1 }}>
              <Select>
                <Option value="Debit">Expenses / Assets (Debit)</Option>
                <Option value="Credit">Income / Liabilities / Equity (Credit)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="taxLine" label="Tax Line" style={{ flex: 1 }}>
              <Input placeholder="e.g., Schedule C" />
            </Form.Item>
          </div>
          {/* Row 4: Parent Account / Description */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="parentId" label="Parent Account" style={{ flex: 1 }}>
              <AccountSelect accounts={accounts.filter(a => a.status === 'Active')} placeholder="(none — top level)" allowClear />
            </Form.Item>
            <Form.Item name="description" label="Description" style={{ flex: 1 }}>
              <Input placeholder="Brief description (optional)" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Pay Bill Modal (inline) */}
      <Modal
        title="Record Payment"
        visible={payModalOpen}
        onOk={() => payForm.submit()}
        onCancel={() => { setPayModalOpen(false); payForm.resetFields(); setSelectedCredit(null); }}
        confirmLoading={paying}
        okText="Record Payment"
        destroyOnClose
        width={520}
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayBill} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]} initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bill Total">
                <Text strong style={{ fontSize: 16 }}>{cSym} {totalAmount.toFixed(2)}</Text>
                {paidAmount > 0 && (
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Already paid: {cSym} {paidAmount.toFixed(2)}</Text></div>
                )}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Payment Amount" required>
            <InputNumber
              style={{ width: '100%' }} min={0.01} step={0.01} prefix={cSym}
              value={payAmount}
              onChange={v => setPayAmount(Number(v) || 0)}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v.replace(/,/g, '')}
            />
          </Form.Item>

          <Form.Item name="bankAccount" label="Pay From (Bank Account)" rules={[{ required: true, message: 'Select a bank account' }]}>
            <AccountSelect accounts={bankAccounts} placeholder="Select bank account" />
          </Form.Item>

          {availableCredits.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 13 }}>Available Vendor Credits</Text>
              {availableCredits.map(c => (
                <div key={c.id}
                  onClick={() => setSelectedCredit(selectedCredit?.id === c.id ? null : c)}
                  style={{
                    padding: '6px 10px', marginTop: 6, borderRadius: 6, cursor: 'pointer',
                    border: selectedCredit?.id === c.id ? '2px solid #1890ff' : '1px solid #d9d9d9',
                    background: selectedCredit?.id === c.id ? '#e6f7ff' : '#fff',
                    display: 'flex', justifyContent: 'space-between'
                  }}>
                  <span>{c.reference || `Credit #${c.id}`}</span>
                  <Text strong>{cSym} {Number(c.remaining_amount).toFixed(2)}</Text>
                </div>
              ))}
              {selectedCredit && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  Credit of {cSym} {Math.min(selectedCredit.remaining_amount, payAmount).toFixed(2)} will be applied
                </Text>
              )}
            </div>
          )}

          <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12, color: '#555' }}>
            <strong>Accounting:</strong>
            {(() => {
              const creditAmt = selectedCredit ? Math.min(selectedCredit.remaining_amount, payAmount) : 0;
              const cashAmt = payAmount - creditAmt;
              return (
                <>
                  {creditAmt > 0 && <div>Vendor Credit — reduces AP: {cSym} {creditAmt.toFixed(2)}</div>}
                  <div>DR Accounts Payable {cSym} {cashAmt.toFixed(2)} &nbsp;/&nbsp; CR Bank Account {cSym} {cashAmt.toFixed(2)}</div>
                </>
              );
            })()}
          </div>
        </Form>
      </Modal>

      {/* Print Check Modal */}
      <Modal
        title={<span><PrinterOutlined style={{ marginRight: 8 }} />Print Check?</span>}
        visible={printModalVisible}
        onCancel={handlePrintLater}
        footer={[
          <Button key="later" onClick={handlePrintLater}>Print Later</Button>,
          <Button key="now" type="primary" icon={<PrinterOutlined />} onClick={handlePrintNow}>Print Now</Button>,
        ]}
        width={460}
        destroyOnClose
      >
        {paidCheck && (
          <div>
            <Text>Check <strong>#{paidCheck.checkNumber}</strong> for <strong>{cSym}{Number(paidCheck.amount).toFixed(2)}</strong> to <strong>{paidCheck.payee}</strong> was created.</Text>
            <Divider />
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
              <div><strong>Print Now:</strong> Opens the check in the Check Printing screen where you can preview and print. Marks as Printed.</div>
              <div style={{ marginTop: 6 }}><strong>Print Later:</strong> Saves the check as unprinted. Print later from Check Printing.</div>
            </div>
          </div>
        )}
      </Modal>
      </Card>

      <JournalEntryDetailModal
        journalEntryId={journalDetailId}
        visible={!!journalDetailId}
        onClose={() => setJournalDetailId(null)}
      />
    </div>
  );
};

export default EnterBill;
