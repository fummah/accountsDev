import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Card, Form, Input, Button, DatePicker, Select, message, Divider, Modal,
  Row, Col, InputNumber, Typography, Space, Tag, Tooltip, Collapse, Statistic, Badge, Table, Alert
} from 'antd';
import {
  PlusOutlined, MinusCircleOutlined, SaveOutlined,
  FileTextOutlined, DollarOutlined, SwapOutlined,
  PaperClipOutlined, ReloadOutlined, DownloadOutlined,
  PrinterOutlined, BookOutlined, ShoppingCartOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import COUNTRIES from '../../../utils/countries';
import { phoneInputHandler } from '../../../utils/phone';
import { dedupeAccounts, getBillLineAccounts, BILL_LINE_ACCOUNT_TYPES } from '../../../utils/accounts';
import { isPurchasable, itemTypeLabel, tracksInventory } from '../../../utils/itemTypes';
import { printHtml, PRINT_BASE_CSS } from '../../../utils/printDocument';
import AccountSelect from '../../shared/AccountSelect';
import ContactIdentityNote from '../../shared/ContactIdentityNote';
import AttachmentManager from '../../shared/AttachmentManager';
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
  // Line-level purchase tax (defaults from the Item Master's Purchase Tax Code).
  taxRateId: undefined,
  taxRate: 0,
  taxAmount: 0,
  // Purchase Order linkage (set when the line came from a PO).
  purchaseOrderId: undefined,
  purchaseOrderLineId: undefined,
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
  const [printing, setPrinting] = useState(false);
  const [billCredits, setBillCredits] = useState([]);
  // Open Purchase Orders for the selected vendor (Add from PO).
  const [openPOs, setOpenPOs] = useState([]);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [loadingPOs, setLoadingPOs] = useState(false);
  // Warehouses back the per-line Warehouse select on inventory item lines.
  const [warehouses, setWarehouses] = useState([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState(null);
  const [vatRates, setVatRates] = useState([]);
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
  // Deep link from a Purchase Order: ?po=<id> pre-fills the vendor + billable lines.
  const preSelectedPoId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const pid = params.get('po');
    return pid ? Number(pid) : null;
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
  const [pendingFiles, setPendingFiles] = useState([]);
  const attachmentRef = useRef(null);
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
    loadVat();
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
        try {
          const ca = await window.electronAPI.billCreditApplications?.(Number(id));
          setBillCredits(Array.isArray(ca) ? ca : []);
        } catch { setBillCredits([]); }
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
            taxRateId: l.tax_rate_id != null ? Number(l.tax_rate_id) : undefined,
            taxRate: l.tax_rate != null ? Number(l.tax_rate) : 0,
            taxAmount: l.tax_amount != null ? Number(l.tax_amount) : 0,
          })));
        }
        // Attachments are loaded and managed by the shared AttachmentManager.
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

  const loadVat = async () => {
    try {
      const data = await window.electronAPI.getAllVat?.();
      setVatRates(Array.isArray(data) ? data : (data?.all || data?.data || []));
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

  const addLine = () => setLines(prev => [...prev, makeBillLine()]);
  const removeLine = (key) => { if (lines.length > 1) setLines(prev => prev.filter(l => l.key !== key)); };

  // Line-level purchase tax for an item line (percent of qty × rate).
  const computeTax = (line) => {
    if (line.line_type !== LINE_ITEM) return 0;
    const base = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
    return Math.round(base * ((Number(line.taxRate) || 0) / 100) * 100) / 100;
  };

  // One place recomputes a line's amount, so an item line's total can never
  // drift from its quantity x rate. `amount` is the line TOTAL including tax,
  // so every existing bill total / balance query stays correct; taxAmount is
  // kept separately for the GL split.
  const recomputeAmount = (line) =>
    line.line_type === LINE_ITEM
      ? Math.round((((Number(line.quantity) || 0) * (Number(line.rate) || 0)) + computeTax(line)) * 100) / 100
      : (Number(line.amount) || 0);

  const updateLine = (key, field, value) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    const next = { ...l, [field]: value };
    next.taxAmount = computeTax(next);
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
  // The Rate defaults from the Item master's PURCHASE COST (not its selling
  // price), so the Bill starts at the normal cost while remaining fully
  // overridable for this transaction. The Item master cost is never rewritten
  // by a bill.
  const selectLineItem = (key, productId) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    if (productId == null) {
      return { ...l, productId: undefined, description: '', amount: recomputeAmount({ ...l, productId: undefined, description: '' }) };
    }
    const prod = products.find(p => Number(p.id) === Number(productId));
    const vat = prod && prod.purchase_tax_rate_id != null
      ? vatRates.find(r => Number(r.id) === Number(prod.purchase_tax_rate_id))
      : null;
    const next = {
      ...l,
      productId: Number(productId),
      description: prod ? (prod.purchase_description || prod.description || prod.name || '') : l.description,
      quantity: l.quantity != null ? l.quantity : 1,
      warehouseId: l.warehouseId != null ? l.warehouseId : (defaultWarehouseId ?? undefined),
      rate: (l.rate != null && Number(l.rate) > 0) ? l.rate : (prod && Number(prod.purchase_cost) > 0 ? Number(prod.purchase_cost) : l.rate),
      // Purchase tax defaults from the Item Master's Purchase Tax Code.
      taxRateId: vat ? Number(vat.id) : (l.taxRateId ?? undefined),
      taxRate: vat ? (Number(vat.vat_percentage) || 0) : (Number(l.taxRate) || 0),
    };
    next.taxAmount = computeTax(next);
    next.amount = recomputeAmount(next);
    return next;
  }));

  const totalAmount = lines.reduce((s, l) => s + recomputeAmount(l), 0);
  const taxTotal = lines.reduce((s, l) => s + computeTax(l), 0);
  const netTotal = totalAmount - taxTotal;
  const paidAmount = Number(billData?.paid_amount) || 0;
  const remaining = totalAmount - paidAmount;

  // ── Purchase Order integration ────────────────────────────────────────────
  const loadOpenPOs = async (vendorId) => {
    if (!vendorId) { setOpenPOs([]); return; }
    setLoadingPOs(true);
    try {
      const pos = await window.electronAPI.getOpenPurchaseOrders?.(Number(vendorId));
      setOpenPOs(Array.isArray(pos) ? pos : []);
    } catch { setOpenPOs([]); }
    finally { setLoadingPOs(false); }
  };

  // Append a PO's still-billable lines onto the bill. Every default the Item
  // master already knows (description, cost, unit, item type) comes across; the
  // line keeps the PO + PO-line ids for traceability and matching.
  const addFromPO = (po) => {
    const newLines = (po.lines || [])
      .map(l => {
        const remainingToBill = Math.max(0, (Number(l.qty_ordered) || 0) - (Number(l.qty_billed) || 0));
        if (remainingToBill <= 0) return null;
        return makeBillLine({
          line_type: LINE_ITEM,
          productId: l.item_id != null ? Number(l.item_id) : undefined,
          description: l.description || '',
          quantity: remainingToBill,
          rate: Number(l.unit_cost) || 0,
          amount: (Number(l.unit_cost) || 0) * remainingToBill,
          warehouseId: defaultWarehouseId ?? undefined,
          purchaseOrderId: po.id,
          purchaseOrderLineId: l.id,
        });
      })
      .filter(Boolean);
    if (!newLines.length) { message.info('This Purchase Order has no remaining quantity to bill.'); return; }
    setLines(prev => {
      const kept = prev.filter(l => Number(l.amount) > 0 || l.productId != null || l.accountId != null);
      return [...kept, ...newLines];
    });
    if (!form.getFieldValue('vendorId')) form.setFieldsValue({ vendorId: po.vendor_id });
    setPoPickerOpen(false);
    message.success(`Added ${newLines.length} line(s) from ${po.po_number}`);
  };

  // Deep link from a Purchase Order (?po=<id>): pre-fill the vendor and append
  // the PO's billable lines, reusing the exact same Add-from-PO logic.
  const poLinkAppliedRef = useRef(null);
  useEffect(() => {
    if (!preSelectedPoId || editId) return;
    if (poLinkAppliedRef.current === preSelectedPoId) return;
    poLinkAppliedRef.current = preSelectedPoId;
    (async () => {
      try {
        const po = await window.electronAPI.getPurchaseOrder?.(preSelectedPoId);
        if (!po || po.error) { message.error('Unable to create bill from this PO.'); return; }
        form.setFieldsValue({ vendorId: Number(po.vendor_id) });
        loadOpenPOs(po.vendor_id);
        addFromPO(po);
      } catch { message.error('Unable to create bill from this PO.'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedPoId, editId, vendors]);

  // Three-way match: warn (never silently block) when an inventory line is billed
  // for more than has been received.
  const threeWayIssues = () => {
    const issues = [];
    lines.forEach(l => {
      if (l.line_type !== LINE_ITEM || l.purchaseOrderLineId == null) return;
      const po = openPOs.find(p => p.id === l.purchaseOrderId);
      const pol = po && (po.lines || []).find(x => x.id === l.purchaseOrderLineId);
      if (!pol) return;
      const billQty = Number(l.quantity) || 0;
      const received = Number(pol.qty_received) || 0;
      const previouslyBilled = Math.max(0, (Number(pol.qty_billed) || 0));
      if (billQty > received - previouslyBilled + 1e-9) {
        issues.push(`${l.description || 'line'}: billing ${billQty}, but only ${Math.max(0, received - previouslyBilled)} received and not yet billed.`);
      }
    });
    return issues;
  };

  const confirmThreeWay = () => new Promise((resolve) => {
    const issues = threeWayIssues();
    if (!issues.length) { resolve(true); return; }
    Modal.confirm({
      title: 'Bill quantity exceeds quantity received',
      content: (
        <div>
          <p>The following lines are billed for more than has been received:</p>
          <ul style={{ paddingLeft: 18 }}>{issues.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <p style={{ marginBottom: 0 }}>You can still save the bill (an override is recorded), or receive the remaining items first.</p>
        </div>
      ),
      okText: 'Save Bill Anyway',
      cancelText: 'Cancel',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });

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
    const ok = await confirmThreeWay();
    if (!ok) return;
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
          purchase_order_id: isItem && l.purchaseOrderId != null ? Number(l.purchaseOrderId) : null,
          purchase_order_line_id: isItem && l.purchaseOrderLineId != null ? Number(l.purchaseOrderLineId) : null,
          taxRateId: l.taxRateId != null ? Number(l.taxRateId) : null,
          taxRate: Number(l.taxRate) || 0,
          taxAmount: computeTax(l),
        };
      });

      let res;
      if (isEdit) {
        res = await window.electronAPI.updateExpense({ id: Number(editId), payee, payment_account, ref_no, category, payment_method, entered_by, payment_date, approval_status, memo, due_date, terms, lines: expenseLines });
      } else {
        res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines, due_date, memo, terms);
      }
      if (res && res.success) {
        // Flush any pending attachments through the shared AttachmentManager
        // (it stores a managed COPY; the user's original file is never touched).
        const expenseId = Number(res.expenseId || res.id || editId || (res.result && res.result.lastInsertRowid) || 0);
        if (expenseId > 0) {
          try { await attachmentRef.current?.uploadPending(expenseId); }
          catch (uploadErr) {
            console.error('[attachments] bill attachment upload failed:', uploadErr);
            message.error('The bill was saved, but an attachment could not be stored. Please try attaching it again.');
          }
        }
        message.success(isEdit ? 'Bill updated' : 'Bill saved — recorded as Accounts Payable');
        if (!isEdit) {
          resetForm();
          setPendingFiles([]);
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
  // Purchasable items: Inventory Parts (receive stock), Non-Inventory Parts and
  // Services (post to their configured expense account). Stock only moves for
  // inventory-tracked items — the backend enforces that from the item type.
  const itemOptions = (Array.isArray(products) ? products : []).filter(p =>
    (p.is_active == null || Number(p.is_active)) && isPurchasable(p.type));
  const inventoryItems = itemOptions; // legacy alias used below
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

  // Read-only accounting preview: which account this line will post to. Item
  // lines resolve from the Item Master (Inventory Asset for inventory parts,
  // the configured Expense/COGS account otherwise); account lines show their
  // own account. The backend remains authoritative.
  const previewAccount = (line) => {
    if (line.line_type !== LINE_ITEM) {
      const a = accounts.find(x => Number(x.id) === Number(line.accountId));
      return a ? (a.accountName || a.name) : (line.category || '—');
    }
    const p = products.find(x => Number(x.id) === Number(line.productId));
    if (!p) return '—';
    const inv = tracksInventory(p.type);
    const id = inv ? p.inventory_asset_account_id : p.purchase_expense_account_id;
    const a = id != null ? accounts.find(x => Number(x.id) === Number(id)) : null;
    if (a) return a.accountName || a.name;
    return inv ? 'Inventory Asset' : 'Expense';
  };

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
      title: 'Tax %', key: 'tax', width: 90,
      render: (_, r) => (r.line_type === LINE_ITEM
        ? <InputNumber size="small" min={0} step={0.01} style={{ width: '100%' }} value={r.taxRate}
            onChange={v => updateLine(r.key, 'taxRate', v || 0)} />
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
      title: 'Accounting', key: 'accounting', width: 150,
      render: (_, r) => (
        <Tooltip title={`Posts to: ${previewAccount(r)}`}>
          <span style={{ color: '#595959', fontSize: 12 }}>{previewAccount(r)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'PO / Match', key: 'poMatch', width: 190,
      render: (_, r) => {
        if (r.purchaseOrderLineId == null) return dash;
        const po = openPOs.find(p => p.id === r.purchaseOrderId);
        const pol = po && (po.lines || []).find(x => x.id === r.purchaseOrderLineId);
        if (!pol) return <Tag color="blue">{po?.po_number || 'PO'}</Tag>;
        const received = Number(pol.qty_received) || 0;
        const billed = Math.max(0, Number(pol.qty_billed) || 0);
        const billQty = Number(r.quantity) || 0;
        const over = billQty > received - billed + 1e-9;
        return (
          <div style={{ fontSize: 11 }}>
            <div><Tag color="blue" style={{ fontSize: 10 }}>{po?.po_number}</Tag></div>
            <div>Ordered {pol.qty_ordered} · Rcvd {received} · Billed {billed}</div>
            {over && <span style={{ color: '#fa8c16' }}><ExclamationCircleOutlined /> exceeds received</span>}
          </div>
        );
      },
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

  // ── Print the SAVED bill (never the visible React form state) ────────────
  const accountNameById = (id) => {
    if (id == null) return '';
    const a = (accounts || []).find(x => Number(x.id) === Number(id));
    return a ? (a.accountName || a.name || '') : '';
  };

  const buildBillHtml = (model, company) => {
    const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');
    const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const d = (v) => (v ? moment(v).format('MM/DD/YYYY') : '-');
    const co = company || {};
    const coAddr = [co.address || co.address1, co.city, co.state, co.postal_code].filter(Boolean).join(', ');
    const exp = model.expense || {};
    const vendor = model.vendor || {};

    const lineType = (l) => (l.line_type === 'item' ? (itemTypeLabel(l.product_type) || 'Inventory / Non-Inventory Item') : 'Expense Account');
    const lineName = (l) => l.line_type === 'item'
      ? (l.product_name || l.description || '-')
      : (accountNameById(l.account_id) || l.category || '-');

    const rows = (model.lines || []).map(l => `
      <tr>
        <td>${esc(lineType(l))}</td>
        <td>${esc(lineName(l))}</td>
        <td>${esc(l.description || '')}</td>
        <td class="num">${l.line_type === 'item' ? (l.quantity == null ? '' : Number(l.quantity)) : ''}</td>
        <td class="num">${l.line_type === 'item' ? money(l.rate) : ''}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`).join('');

    const poSection = model.po ? `
      <div class="meta"><strong>Source Purchase Order:</strong> ${esc(model.po.po_number)}</div>
      ${(model.receipts || []).map(r => `<div class="meta"><strong>Receipt:</strong> ${esc(r.receipt_number)}${r.reference ? ` (${esc(r.reference)})` : ''} — ${d(r.receipt_date)}</div>`).join('')}` : '';

    const attachSection = (model.attachments || []).length
      ? `<div class="section-title">Attachments</div><div class="meta">${(model.attachments || []).map(a => esc(a.document_name)).join(', ')}</div>` : '';

    return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(exp.ref_no || exp.id)}</title>
      <style>${PRINT_BASE_CSS}</style></head><body><div class="doc">
        <div class="header">
          <div>
            <h1>${esc(co.name || co.companyName || '')}</h1>
            <div class="muted">${esc(coAddr)}</div>
            <div class="muted">${esc(co.phone || co.phone_number || '')}</div>
          </div>
          <div style="text-align:right">
            <h2>VENDOR BILL</h2>
            <div class="meta"><strong>Bill #:</strong> ${esc(exp.ref_no || exp.id)}</div>
            <div class="meta"><span class="badge ${model.status === 'Paid' ? 'ok' : ''}">${esc(model.status)}</span></div>
          </div>
        </div>

        <div class="header" style="border-bottom:none;padding-bottom:0;margin-bottom:0">
          <div>
            <div class="meta"><strong>Vendor:</strong> ${esc(vendor.display_name || [vendor.first_name, vendor.last_name].filter(Boolean).join(' ') || vendor.company_name || '')}</div>
            <div class="meta muted">${esc([vendor.address1, vendor.city, vendor.state, vendor.postal_code].filter(Boolean).join(', '))}</div>
          </div>
          <div style="text-align:right">
            <div class="meta"><strong>Bill Date:</strong> ${d(exp.payment_date)}</div>
            <div class="meta"><strong>Due Date:</strong> ${d(exp.due_date)}</div>
            <div class="meta"><strong>Terms:</strong> ${esc(exp.terms || '')}</div>
          </div>
        </div>
        ${poSection}
        ${exp.memo ? `<div class="meta"><strong>Memo:</strong> ${esc(exp.memo)}</div>` : ''}

        <table>
          <thead><tr><th>Type</th><th>Item / Account</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="summary">
          <div class="row"><span>Subtotal</span><span>${money(model.totalAmount)}</span></div>
          <div class="row total"><span>Total</span><span>${money(model.totalAmount)}</span></div>
          <div class="row"><span>Paid</span><span>${money(model.paid)}</span></div>
          <div class="row"><span>Balance Due</span><span>${money(model.remaining)}</span></div>
        </div>

        ${attachSection}
      </div></body></html>`;
  };

  const handlePrintBill = async () => {
    if (!isEdit || !editId) { message.warning('Save the bill before printing.'); return; }
    setPrinting(true);
    try {
      const [model, company] = await Promise.all([
        window.electronAPI.getBillPrint?.(Number(editId)),
        window.electronAPI.getCompany?.().catch(() => null),
      ]);
      if (!model || model.error || !model.expense) {
        message.error('Unable to prepare this document for printing.');
        return;
      }
      if (!printHtml(buildBillHtml(model, company || {}))) {
        message.error('Printing was blocked. Please allow pop-ups and try again.');
      }
    } catch (e) {
      console.error('[bill] print failed:', e);
      message.error('Unable to prepare this document for printing.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />{isEdit ? 'Edit Bill' : 'Enter Bill'}</span>}
        extra={<Space><Button icon={<PrinterOutlined />} loading={printing} onClick={handlePrintBill}>Print</Button><Button icon={<DownloadOutlined />} onClick={() => {}}>Export</Button><Button icon={<ReloadOutlined />} onClick={loadVendors}>Refresh</Button></Space>}>
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
                    // Offer this vendor's open Purchase Orders for Add-from-PO.
                    loadOpenPOs(v);
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
          <AttachmentManager
            ref={attachmentRef}
            entityType="bill"
            entityId={isEdit ? editId : null}
            pendingFiles={pendingFiles}
            onPendingChange={setPendingFiles}
            entityLabel="Bill"
            emptyText="No attachments yet — attach the vendor invoice or receipt."
          />
        </FormSection>

        {isEdit && billCredits.length > 0 && (
          <FormSection title="Vendor Credits Applied" icon={<ShoppingCartOutlined />}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {billCredits.map(ca => (
                <div key={ca.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>VC-{String(ca.credit_id).padStart(5, '0')}{ca.reference ? ` — ${ca.reference}` : ''} ({ca.applied_date ? moment(ca.applied_date).format('MM/DD/YYYY') : '-'})</Text>
                  <Text strong>{cSym} {Number(ca.amount || 0).toFixed(2)}</Text>
                </div>
              ))}
            </Space>
          </FormSection>
        )}

        <FormSection title="Line Items" icon={<DollarOutlined />}
          extra={
            <Button size="small" icon={<ShoppingCartOutlined />} loading={loadingPOs}
              onClick={() => {
                const v = form.getFieldValue('vendorId');
                if (!v) { message.warning('Select a vendor first'); return; }
                loadOpenPOs(v); setPoPickerOpen(true);
              }}>
              Add from PO
            </Button>
          }>
          {/* Linked-PO match strip: shows the three-way state at a glance. */}
          {lines.some(l => l.purchaseOrderLineId != null) && (() => {
            const issues = threeWayIssues();
            return (
              <Alert
                type={issues.length ? 'warning' : 'success'}
                showIcon
                style={{ marginBottom: 10, borderRadius: 8 }}
                message={issues.length ? 'Three-way match: bill exceeds quantity received' : 'Three-way match: lines match the Purchase Order / receipts'}
                description={issues.length ? issues.join(' ') : undefined}
              />
            );
          })()}
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
              scroll={{ x: 1270 }}
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
                taxTotal > 0 ? { label: 'Subtotal', value: `${cSym} ${netTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` } : null,
                taxTotal > 0 ? { label: 'Tax', value: `${cSym} ${taxTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` } : null,
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

      {/* ── Add from Purchase Order ─────────────────────────────────────── */}
      <Modal
        title={<span><ShoppingCartOutlined style={{ marginRight: 8 }} />Open Purchase Orders</span>}
        visible={poPickerOpen}
        onCancel={() => setPoPickerOpen(false)}
        footer={<Button onClick={() => setPoPickerOpen(false)}>Close</Button>}
        width={900}
        destroyOnClose
      >
        <Table
          size="small"
          rowKey="id"
          loading={loadingPOs}
          dataSource={openPOs}
          pagination={false}
          locale={{ emptyText: 'No open Purchase Orders for this vendor.' }}
          columns={[
            { title: 'PO #', dataIndex: 'po_number', width: 110, render: v => <Text strong>{v}</Text> },
            { title: 'PO Date', dataIndex: 'po_date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
            { title: 'Total', dataIndex: 'total', width: 110, align: 'right', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
            { title: 'Received', key: 'recv', width: 100, align: 'right', render: (_, r) => `${r.totalReceived || 0}/${r.totalOrdered || 0}` },
            { title: 'Billed', key: 'bill', width: 100, align: 'right', render: (_, r) => `${r.totalBilled || 0}/${r.totalOrdered || 0}` },
            { title: 'Available to Bill', key: 'avail', width: 130, align: 'right', render: (_, r) => Math.max(0, (r.totalOrdered || 0) - (r.totalBilled || 0)) },
            {
              title: '', key: 'act', width: 90,
              render: (_, r) => <Button type="primary" size="small" onClick={() => addFromPO(r)}>Add</Button>,
            },
          ]}
        />
      </Modal>

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
