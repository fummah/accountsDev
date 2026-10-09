import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, Form, Input, InputNumber, Select, DatePicker, Button, Table, Space, message, Divider, Row, Col, Modal, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, FilePdfOutlined, PrinterOutlined, EyeOutlined, SettingOutlined, MailOutlined, UserOutlined, FileTextOutlined, UnorderedListOutlined, MessageOutlined } from '@ant-design/icons';
import { handleDocumentPDF } from '../shared/generateDocumentPDF';
import SendEmailModal from '../shared/SendEmailModal';
import { confirmSavedDocumentEdit, confirmPaymentImpact, confirmFinancialImpact, useUnsavedChanges } from '../shared/documentEditGuard';
import CustomerContactFields from '../shared/CustomerContactFields';
import { deriveDisplayName, getCustomerName } from '../../../utils/contactIdentity';
import { formatCityStatePostal } from '../../../utils/address';
import { tracksInventory } from '../../../utils/itemTypes';
import { resolveTaxRateFields } from '../../../utils/taxRate';
import {
  FormSection, FormGrid, FormCol, DocumentActionBar, TotalsBlock, FORM_ITEM_STYLE,
  MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH, PAGE_WRAPPER_STYLE,
} from '../../shared/FormSection';
import { useHistory, useParams, useLocation } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { ensureTrailingEmptyLine, removeLineItem, normalizeDocumentLines, collapseToSingleTrailingEmpty } from '../../../utils/lineItems';

import AccountSelect from '../../shared/AccountSelect';
import { InvoiceStatusBadge } from '../../StatusBadge';

const CreateInvoice = () => {
  const { symbol: cSym } = useCurrency();
  const { id } = useParams();
  const history = useHistory();
  const location = useLocation();
  const isEdit = Boolean(id);

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.push('/main/customers/invoices/list');
  };

  const [form] = Form.useForm();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [vatRates, setVatRates] = useState([]);
  const [lines, setLines] = useState([{ key: Date.now(), description: '', quantity: 1, rate: 0, amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState({});
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [vatModalOpen, setVatModalOpen] = useState(false);
  const [invoiceTemplate, setInvoiceTemplate] = useState({});
  const [incomeAccounts, setIncomeAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [custForm] = Form.useForm();
  const [prodForm] = Form.useForm();
  const [catForm] = Form.useForm();
  const [vatForm] = Form.useForm();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);
  const [paidToDate, setPaidToDate] = useState(0);
  const [paidDate, setPaidDate] = useState('');
  // Invoice status is system controlled — never chosen by the user. The stored
  // value comes from the backend; the live badge below also reacts to edits.
  const [invoiceStatus, setInvoiceStatus] = useState('Open');
  const [isDirty, setIsDirty] = useState(false);
  const [originalFinancials, setOriginalFinancials] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const armedRef = useRef(false);            // first-edit warning acknowledged this session
  const formSnapshotRef = useRef(null);      // last acknowledged form values (for revert)
  const navBypassRef = useRef(false);        // set before a save-triggered navigation

  useUnsavedChanges(isDirty, navBypassRef);

  const calcDueDate = (invoiceDate, terms) => {
    if (!invoiceDate || !terms) return;
    const match = (terms || '').match(/Net\s*(\d+)/i);
    if (match) {
      const days = parseInt(match[1], 10);
      const due = moment(invoiceDate).add(days, 'days');
      form.setFieldsValue({ last_date: due });
    } else if ((terms || '').toLowerCase().includes('receipt')) {
      form.setFieldsValue({ last_date: moment(invoiceDate) });
    }
  };

  const applyCustomer = (cust, rates = vatRates, companyDefaultRate = null) => {
    if (!cust) return;
    const updates = {};
    if (cust.email && cust.email !== 'null') updates.customer_email = cust.email;
    const addrParts = [
      cust.address1, cust.address2,
      formatCityStatePostal(cust.city, cust.state, cust.postal_code || cust.zip),
    ].filter(v => v && v !== 'null');
    if (addrParts.length > 0) updates.billing_address = addrParts.join('\n');
    if (cust.terms && cust.terms !== 'null') updates.terms = cust.terms;
    // Auto-populate tax: customer's Default Tax Rate wins when they are
    // taxable and a rate is set; otherwise fall back to the company default.
    const compRate = companyDefaultRate != null
      ? Number(companyDefaultRate)
      : (company && company.vat_rate != null ? Number(company.vat_rate) : 0);
    const isTaxExempt = cust.taxable != null && !Number(cust.taxable);
    if (isTaxExempt) {
      updates.vat = 0;
      setVatPercent(0);
    } else if (cust.default_tax_rate != null) {
      const rate = Number(cust.default_tax_rate);
      const matched = rates.find(v => Number(v.vat_percentage) === rate);
      if (matched) {
        updates.vat = rate;
        setVatPercent(rate);
      } else if (compRate > 0) {
        updates.vat = compRate;
        setVatPercent(compRate);
      }
    } else if (compRate > 0) {
      updates.vat = compRate;
      setVatPercent(compRate);
    }
    form.setFieldsValue(updates);
    if (updates.terms) {
      const startDate = form.getFieldValue('start_date');
      calcDueDate(startDate, updates.terms);
    }
  };

  const dateRef = useRef();

  const applyCustomerChange = (custId) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) applyCustomer(cust);
    setTimeout(() => dateRef.current?.focus(), 50);
  };

  const isFinancialField = (field) => ['vat', 'start_date', 'last_date', 'terms', 'number', 'customer', 'billing_address'].includes(field);

  // First material change on an already-saved invoice → warn once per session.
  // Cancel → do not perform the attempted change.
  const runEditGuard = useCallback(async (apply, { financial = true } = {}) => {
    if (!isEdit || armedRef.current) { apply(); setIsDirty(true); return; }
    const paid = Number(originalFinancials?.paidToDate) || 0;
    const ok = (financial && paid > 0)
      ? await confirmPaymentImpact({ paidToDate: paid, currentTotal: Number(originalFinancials?.total) || 0, currencySymbol: cSym })
      : await confirmSavedDocumentEdit('Invoice');
    if (ok) { armedRef.current = true; apply(); setIsDirty(true); }
  }, [isEdit, originalFinancials, cSym]);

  // Invoice-level (form) changes are applied by antd Form before this fires, so
  // a cancel must revert the form to the last acknowledged snapshot.
  const handleFormValuesChange = (changed) => {
    const isCustomer = Object.prototype.hasOwnProperty.call(changed, 'customer');
    if (!isEdit) {
      if (isCustomer) { setSelectedCustomerId(changed.customer != null ? Number(changed.customer) : null); applyCustomerChange(changed.customer); }
      setIsDirty(true);
      return;
    }
    if (armedRef.current) {
      if (isCustomer) { setSelectedCustomerId(changed.customer != null ? Number(changed.customer) : null); applyCustomerChange(changed.customer); }
      setIsDirty(true);
      return;
    }
    const prevVals = formSnapshotRef.current || {};
    const prevCustomerId = selectedCustomerId;
    const paid = Number(originalFinancials?.paidToDate) || 0;
    const financial = Object.keys(changed).some(isFinancialField);
    const proceed = async () => {
      const ok = (financial && paid > 0)
        ? await confirmPaymentImpact({ paidToDate: paid, currentTotal: Number(originalFinancials?.total) || 0, currencySymbol: cSym })
        : await confirmSavedDocumentEdit('Invoice');
      if (ok) {
        armedRef.current = true;
        if (isCustomer) { setSelectedCustomerId(changed.customer != null ? Number(changed.customer) : null); applyCustomerChange(changed.customer); }
        formSnapshotRef.current = form.getFieldsValue();
        setIsDirty(true);
      } else {
        form.setFieldsValue(prevVals);
        if (Object.prototype.hasOwnProperty.call(changed, 'vat')) setVatPercent(Number(prevVals.vat) || 0);
        setSelectedCustomerId(prevCustomerId);
      }
    };
    proceed();
  };

  useEffect(() => {
    setLoading(true);
    loadDeps().then(() => {
      if (isEdit) return loadInvoice();
    }).finally(() => setLoading(false));
  }, [id]);

  const handleAddCustomer = async () => {
    try {
      const vals = await custForm.validateFields();
      // One derivation rule (explicit -> personal name -> company), shared with
      // the backend. The old inline copy also fell back to the email and then to
      // 'New Customer'; the backend honours an explicit display_name verbatim,
      // so that placeholder could be persisted as the customer's actual name.
      const display = deriveDisplayName(vals);
      const tax = resolveTaxRateFields(vals, vatRates);
      await window.electronAPI.insertCustomer(
        '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '',
        display, vals.company_name || '', vals.phone_number || '', vals.mobile_number || '',
        '', '', '', vals.address1 || '', vals.address2 || '', vals.city || '', vals.state || '',
        vals.postal_code || '', vals.country || '', '', '', '', 'system', 0, null, 'Email', 'en', vals.notes || '',
        vals.taxable != null ? vals.taxable : true,
        tax.default_tax_rate,
        tax.default_tax_rate_id
      );
      message.success('Customer added');
      setCustModalOpen(false);
      custForm.resetFields();
      const c = await window.electronAPI.getAllCustomers?.();
      const custArr = Array.isArray(c) ? c : (c?.all || []);
      setCustomers(custArr);
      const newCust = custArr.find(cu => cu.email === vals.email || (cu.first_name === vals.first_name && cu.last_name === vals.last_name));
      if (newCust) form.setFieldsValue({ customer: newCust.id });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add customer'); }
  };

  const handleAddProduct = async () => {
    try {
      const vals = await prodForm.validateFields();
      const incomeAcct = incomeAccounts.find(a => String(a.id) === String(vals.income_account))
        || incomeAccounts.find(a => (a.accountName || a.name) === vals.income_account);
      const res = await window.electronAPI.insertProduct?.(
        vals.type || 'Product', vals.name || '', vals.sku || '', vals.category || '',
        vals.description || '', Number(vals.price) || 0,
        incomeAcct ? (incomeAcct.accountName || incomeAcct.name) : '', '', '', '', 'system',
        Number(vals.stock) || 0,
        incomeAcct ? Number(incomeAcct.id) : null
      );
      message.success('Product added');
      setProdModalOpen(false);
      prodForm.resetFields();
      const p = await window.electronAPI.getAllProducts?.();
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(prodArr);
      // Auto-select the newly created product on the last line using fresh data
      const newProd = prodArr.find(pr => pr.name === vals.name);
      if (newProd && lines.length > 0) {
        const lastKey = lines[lines.length - 1].key;
        const rate = Number(newProd.selling_price || newProd.price || 0);
        setLines(prev => {
          const updated = prev.map(l => {
            if (l.key !== lastKey) return l;
            return { ...l, description: newProd.description || newProd.name || '', rate, amount: (l.quantity || 1) * rate, product_id: newProd.id };
          });
          return ensureTrailingEmptyLine(updated, makeEmptyLine);
        });
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to add product'); }
  };

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.insertProductCategory?.(vals.cat_name);
      if (res?.error) { message.error(res.error); return; }
      message.success('Category added');
      setCatModalOpen(false);
      catForm.resetFields();
      const c = await window.electronAPI.getProductCategories?.();
      setCategories(Array.isArray(c) ? c : []);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add category'); }
  };

  const handleAddVat = async () => {
    try {
      const vals = await vatForm.validateFields();
      await window.electronAPI.insertVat?.(vals.vat_name || '', Number(vals.vat_percentage) || 0, null);
      message.success('Tax rate added');
      setVatModalOpen(false);
      vatForm.resetFields();
      const v = await window.electronAPI.getAllVat?.();
      setVatRates(Array.isArray(v) ? v : []);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add Tax rate'); }
  };

  const loadDeps = async () => {
    try {
      const [c, p, v, coa] = await Promise.all([
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllProducts?.(),
        window.electronAPI.getAllVat?.(),
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
      ]);
      const custArr = Array.isArray(c) ? c : (c?.all || []);
      setCustomers(custArr);
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(prodArr);
      setVatRates(Array.isArray(v) ? v : []);
      const allAccs = Array.isArray(coa) ? coa : (coa?.data || []);
      setAllAccounts(allAccs);
      setIncomeAccounts(allAccs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        return t === 'income' || t === 'other income';
      }));
      const cat = await window.electronAPI.getProductCategories?.();
      setCategories(Array.isArray(cat) ? cat : []);

      // Pre-select customer from query string and auto-populate email/address/terms/tax
      const params = new URLSearchParams(location.search);
      const custId = params.get('customer');
      if (custId && !isEdit) {
        form.setFieldsValue({ customer: Number(custId) });
        const preselectCust = custArr.find(c => Number(c.id) === Number(custId));
        applyCustomer(preselectCust, Array.isArray(v) ? v : []);
      }
    } catch (err) { console.error('loadDeps error:', err); }
    // Load company info and invoice template separately so they never block the form
    try {
      const comp = await window.electronAPI.getCompany?.();
      if (comp) setCompany(comp);
      // Pre-fill terms from company settings for new invoices
      if (comp && !isEdit) {
        const defaults = {};
        if (comp.terms) {
          defaults.terms = comp.terms;
        }
        if (comp.vat_rate != null && Number(comp.vat_rate) > 0) {
          const compRate = Number(comp.vat_rate);
          defaults.vat = compRate;
          setVatPercent(compRate);
        }
        form.setFieldsValue(defaults);
        if (defaults.terms) {
          const startDate = form.getFieldValue('start_date');
          calcDueDate(startDate, defaults.terms);
        }
      }
    } catch {}
    try {
      const tmpl = await window.electronAPI.getInvoiceTemplate?.();
      if (tmpl && !tmpl.error) setInvoiceTemplate(tmpl);
    } catch {}
  };

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const inv = await window.electronAPI.getSingleInvoice?.(id);
      if (inv) {
        setPaidToDate(Number(inv.totalPaid) || 0);
        setPaidDate(inv.paidDate || '');
        setInvoiceStatus(inv.status || 'Open');
        const custVal = inv.customer_id || inv.customer;
        form.setFieldsValue({
          customer: custVal != null ? Number(custVal) : undefined,
          customer_email: inv.customer_email,
          billing_address: inv.billing_address,
          terms: inv.terms,
          start_date: inv.start_date ? moment(inv.start_date) : null,
          last_date: inv.last_date ? moment(inv.last_date) : null,
          number: inv.number,
          message: inv.message,
          statement_message: inv.statement_message,
          vat: inv.vat != null ? Number(inv.vat) : 0,
        });
        setVatPercent(inv.vat != null ? Number(inv.vat) : 0);
        const custId = (inv.customer_id || inv.customer) != null ? Number(inv.customer_id || inv.customer) : null;
        setSelectedCustomerId(custId);
        if (Array.isArray(inv.lines) && inv.lines.length > 0) {
          // Drop any legacy blank rows before editing, then add exactly ONE
          // convenience row so the form never shows multiple empty lines.
          const loaded = normalizeDocumentLines(inv.lines).map((l, i) => ({
            key: Date.now() + i,
            description: l.description || '',
            quantity: l.quantity || 1,
            rate: l.rate || 0,
            amount: (l.quantity || 1) * (l.rate || 0),
            product_id: l.product_id ? Number(l.product_id) : (l.product ? Number(l.product) : null),
          }));
          // One blank trailing row for convenient entry; never persisted.
          setLines(ensureTrailingEmptyLine(loaded, makeEmptyLine));
        }
        // Snapshot the original financial state for payment warnings / impact confirm.
        const loadedSubtotal = (inv.lines || []).reduce((s, l) => s + (Number(l.quantity || 1) * Number(l.rate || 0)), 0);
        const loadedTotal = loadedSubtotal * (1 + (Number(inv.vat) || 0) / 100);
        setPaidToDate(Number(inv.totalPaid) || 0);
        setOriginalFinancials({ total: loadedTotal, paidToDate: Number(inv.totalPaid) || 0, status: inv.status });
        armedRef.current = false;
        setIsDirty(false);
        formSnapshotRef.current = form.getFieldsValue();
      }
    } catch { message.error('Failed to load invoice'); }
    setLoading(false);
  };

  const makeEmptyLine = () => ({ key: Date.now(), description: '', quantity: 1, rate: 0, amount: 0 });

  const addLine = () => {
    runEditGuard(() => setLines(prev => [...prev, makeEmptyLine()]));
  };

  const removeLine = (key) => {
    // Deleting a line — including the auto-created blank convenience row —
    // actually removes it. A trailing blank is NOT force-recreated here; the
    // next product selection (or "Add Line") provides one again.
    runEditGuard(() => setLines(prev => removeLineItem(prev, l => l.key !== key, makeEmptyLine)));
  };

  const updateLine = (key, field, value) => {
    runEditGuard(() => setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      updated.amount = (Number(updated.quantity) || 0) * (Number(updated.rate) || 0);
      return updated;
    })));
  };

  const selectProduct = (key, productId) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) {
      // Clearing the product resets the line, but never auto-adds a row.
      runEditGuard(() => setLines(prev => collapseToSingleTrailingEmpty(
        prev.map(l => (l.key === key ? { ...l, product_id: null, description: '', rate: 0, amount: 0 } : l)),
        makeEmptyLine
      )));
      return;
    }
    const desc = prod.sales_description || prod.description || prod.name || '';
    const rate = Number(prod.price || 0);
    // Sales tax defaults from the Item Master's Sales Tax Code when the invoice
    // has no explicit rate yet. The line also snapshots the rate on the backend.
    const prodTax = prod.sales_tax_rate_id != null
      ? vatRates.find(v => Number(v.id) === Number(prod.sales_tax_rate_id))
      : null;
    if (prodTax && !(Number(form.getFieldValue('vat')) > 0)) {
      form.setFieldsValue({ vat: Number(prodTax.vat_percentage) || 0 });
      setVatPercent(Number(prodTax.vat_percentage) || 0);
    }
    runEditGuard(() => setLines(prev => {
      const updated = prev.map(l => {
        if (l.key !== key) return l;
        return { ...l, description: desc, rate, amount: (Number(l.quantity) || 1) * rate, product_id: productId };
      });
      // Product selected → make sure a fresh empty line waits below.
      return ensureTrailingEmptyLine(updated, makeEmptyLine);
    }));
  };

  const [vatPercent, setVatPercent] = useState(0);
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vatAmount = subtotal * (Number(vatPercent) || 0) / 100;
  const grandTotal = subtotal + vatAmount;

  // Read-only status shown to the user. Document lifecycle states (Draft / Void /
  // Cancelled) win; otherwise the badge mirrors exactly the rule the backend uses
  // (total vs. paid-to-date), so the page and the lists always agree.
  const INVOICE_DOC_STATES = ['draft', 'void', 'voided', 'cancelled', 'canceled'];
  const displayStatus = useMemo(() => {
    if (INVOICE_DOC_STATES.includes(String(invoiceStatus || '').toLowerCase())) return invoiceStatus;
    const paid = Number(paidToDate) || 0;
    if (grandTotal > 0 && paid >= grandTotal - 0.005) return 'Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Open';
  }, [invoiceStatus, paidToDate, grandTotal]);

  // Invoice status is never submitted — the backend derives it from the invoice
  // total and the real payment allocations. `statusOverride` is retained only for
  // signature compatibility with the (now removed) manual status buttons.
  const handleSave = async (statusOverride, navigate = true) => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const customer = vals.customer;
      const customer_email = vals.customer_email || '';
      const billing_address = vals.billing_address || '';
      const terms = vals.terms || '';
      const start_date = vals.start_date ? vals.start_date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const last_date = vals.last_date ? vals.last_date.format('YYYY-MM-DD') : '';
      const msg = vals.message || '';
      const statement_message = vals.statement_message || '';
      const number = vals.number || '';
      const vat = Number(vals.vat) || 0;
      // Only MEANINGFUL lines are saved — the blank convenience row (and any
      // legacy blank row) is UI-only and must never become a document line.
      const invoiceLines = normalizeDocumentLines(lines).map(l => ({
        description: l.description || '',
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        amount: Number(l.amount) || 0,
        product_id: l.product_id || null,
      }));

      // Validate that every line has a product selected
      if (invoiceLines.length === 0) {
        message.error('Please add at least one line item');
        return null;
      }
      const missingProduct = invoiceLines.find(l => !l.product_id);
      if (missingProduct) {
        message.error('Please select a product from the dropdown for each line item. All lines must have a product selected from the system.');
        return null;
      }

      // If this saved invoice already has payments and the total is changing,
      // show the financial impact and confirm before saving. Existing payment
      // records are never modified — only the balance/status follow.
      const existingIdPreview = savedInvoiceId || (id ? Number(id) : null);
      const paid = Number(paidToDate) || 0;
      if (existingIdPreview && paid > 0) {
        const newTotal = invoiceLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * (1 + (vat || 0) / 100);
        const prevTotal = Number(originalFinancials?.total) || 0;
        if (Math.abs(newTotal - prevTotal) > 0.005) {
          const newBalance = Math.max(0, newTotal - paid);
          const newStatus = newTotal <= paid + 0.005 ? 'Paid' : 'Partially Paid';
          const ok = await confirmFinancialImpact({
            previousTotal: prevTotal, newTotal, paidToDate: paid, newBalance, newStatus, currencySymbol: cSym,
          });
          if (!ok) return null;
        }
      }

      let savedId = null;
      const existingId = savedInvoiceId || (id ? Number(id) : null);
      if (existingId) {
        const res = await window.electronAPI.updateInvoice?.({
          id: existingId, customer, customer_email, billing_address, terms,
          start_date, last_date, message: msg, statement_message, number,
          vat, invoiceLines,
        });
        if (res?.error) { message.error(res.error); return null; }
        message.success('Invoice updated');
        savedId = existingId;
        setSavedInvoiceId(savedId);
        if (res.financials) {
          setPaidToDate(Number(res.financials.paidToDate) || 0);
          setInvoiceStatus(res.financials.status || 'Open');
          setOriginalFinancials({
            total: Number(res.financials.invoiceTotal) || 0,
            paidToDate: Number(res.financials.paidToDate) || 0,
            status: res.financials.status,
          });
        }
      } else {
        const res = await window.electronAPI.insertInvoice?.(
          customer, customer_email, false, billing_address, terms,
          start_date, last_date, msg, statement_message, number,
          null, vat, null, invoiceLines
        );
        const invId = res?.invoiceId || res?.invoice_id || res?.id;
        if (invId) { savedId = Number(invId); setSavedInvoiceId(savedId); }
        if (res?.error) { message.error(typeof res.error === 'string' ? res.error : 'Insert failed'); return null; }
        if (res?.success === false) { message.error('Failed to create invoice'); return null; }
        if (res?.financials) setInvoiceStatus(res.financials.status || 'Open');
        if (res?.glWarning) {
          Modal.warning({
            title: 'Invoice Saved — Ledger Post Failed',
            content: `The invoice was saved but the journal entry could not be posted: ${res.glWarning}. You can retry now or the system will auto-retry on next startup.`,
            okText: 'Retry Now',
            onOk: async () => {
              const repostRes = await window.electronAPI.journalRepostAll?.();
              if (repostRes?.posted > 0) message.success(`Reposted ${repostRes.posted} entries`);
              else message.warning('No entries needed reposting');
            },
          });
        } else {
          message.success('Invoice created');
        }
      }
      if (navigate) {
        setIsDirty(false);
        armedRef.current = false;
        formSnapshotRef.current = form.getFieldsValue();
        navBypassRef.current = true;
        history.push('/main/customers/invoices/list');
      } else {
        setIsDirty(false);
        armedRef.current = false;
        formSnapshotRef.current = form.getFieldsValue();
      }
      return savedId;
    } catch (e) {
      if (e?.errorFields) return null; // form validation
      message.error('Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndEmail = async () => {
    const savedId = await handleSave(undefined, false);
    if (savedId) setEmailModalOpen(true);
  };

  // Cancel never saves. Leaving the page is already guarded by
  // useUnsavedChanges(): when the form is dirty the existing "Unsaved changes"
  // modal asks before discarding, and when it is pristine we simply go back.
  // No second, competing warning system is introduced here.
  const handleCancel = handleBack;

  const doPDF = (action) => {
    const vals = form.getFieldsValue();
    const cust = customers.find(c => c.id === (vals.customer));
    handleDocumentPDF(action, {
      docType: 'Invoice',
      header: {
        number: vals.number || '',
        status: displayStatus,
        date: vals.start_date ? vals.start_date.format('MM/DD/YYYY') : '',
        dueDate: vals.last_date ? vals.last_date.format('MM/DD/YYYY') : '',
        terms: vals.terms || '',
        customerName: cust ? getCustomerName(cust) : '',
        email: vals.customer_email || '',
        billingAddress: vals.billing_address || '',
        paidDate: paidDate || '',
      },
      lines: normalizeDocumentLines(lines),
      subtotal,
      vatPercent: Number(vatPercent) || 0,
      vatAmount,
      grandTotal,
      paidToDate: Number(paidToDate) || 0,
      message: vals.message || '',
      statementMemo: vals.statement_message || '',
      company: {
        name: company.company_name || company.name || '',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        address1: company.address1 || '',
        address2: company.address2 || '',
        city: company.city || '',
        state: company.state || '',
        postal_code: company.postal_code || company.zip || '',
        country: company.country || '',
        logo: company.logo || null,
      },
      currencySymbol: cSym,
      templateSettings: invoiceTemplate,
    });
  };

  const customerOpen = !isEdit && !new URLSearchParams(location.search).get('customer');

  // Read-only accounting preview for an item line: the Income account, plus the
  // COGS / Inventory Asset accounts for an Inventory Part. The backend posts
  // from the line SNAPSHOT, so this is exactly where the line will post.
  const previewAccounting = (line) => {
    const p = products.find(x => Number(x.id) === Number(line.product_id));
    if (!p) return '—';
    const nm = (id) => { const a = allAccounts.find(x => Number(x.id) === Number(id)); return a ? (a.accountName || a.name) : null; };
    const inc = nm(p.income_account_id) || p.income_account || 'Income';
    if (!tracksInventory(p.type)) return inc;
    return `${inc} · ${nm(p.cogs_account_id) || 'COGS'} · ${nm(p.inventory_asset_account_id) || 'Inventory Asset'}`;
  };

  const lineColumns = [
    { title: 'Product', key: 'product', width: 180,      render: (_, r) => (
        <Select placeholder="Select product" size="small" allowClear style={{ width: '100%' }}
          value={r.product_id != null ? Number(r.product_id) : undefined}
          onChange={v => selectProduct(r.key, v)}
          dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setProdModalOpen(true)} size="small" style={{ width: '100%', textAlign: 'left' }}>Add New Product</Button></>)}>
          {products.map(p => <Select.Option key={p.id} value={Number(p.id)}>{p.name || p.description}</Select.Option>)}
        </Select>
      )},
    { title: 'Description', key: 'desc',
      render: (_, r) => <Input size="small" value={r.description} onChange={e => updateLine(r.key, 'description', e.target.value)} /> },
    { title: 'Qty', key: 'qty', width: 80,
      render: (_, r) => <InputNumber size="small" min={1} value={r.quantity} onChange={v => updateLine(r.key, 'quantity', v)} style={{ width: '100%' }} /> },
    { title: 'Rate', key: 'rate', width: 110,
      render: (_, r) => <InputNumber size="small" min={0} step={0.01} value={r.rate} onChange={v => updateLine(r.key, 'rate', v)} style={{ width: '100%' }} prefix={cSym} /> },
    { title: 'Amount', key: 'amount', width: 110,
      render: (_, r) => <span style={{ fontWeight: 500 }}>{cSym} {Number(r.amount || 0).toFixed(2)}</span> },
    { title: 'Accounting', key: 'accounting', width: 200,
      render: (_, r) => <Tooltip title={`Posts to: ${previewAccounting(r)}`}><span style={{ color: '#595959', fontSize: 12 }}>{previewAccounting(r)}</span></Tooltip> },
    { title: '', key: 'actions', width: 50,
      render: (_, r) => lines.length > 1 ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} /> : null },
  ];

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-page-head-left">
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ borderRadius: 8, color: '#595959', borderColor: '#d9d9d9' }}>Back</Button>
          <h2>{isEdit ? `Edit Invoice #${id}` : 'Create Invoice'}</h2>
        </div>
        <Space wrap>
          <Button className="gx-btn-secondary" icon={<UserOutlined />} disabled={!selectedCustomerId} onClick={() => history.push(`/main/customers/details/${selectedCustomerId}`)}>View Customer</Button>
          {isEdit && (<>
            <Button className="gx-btn-info" icon={<EyeOutlined />} onClick={() => doPDF('preview')}>Preview</Button>
            <Button className="gx-btn-danger" icon={<FilePdfOutlined />} onClick={() => doPDF('download')}>Download PDF</Button>
            <Button className="gx-btn-warning" icon={<PrinterOutlined />} onClick={() => doPDF('print')}>Print</Button>
          </>)}
          <Button className="gx-btn-primary-light" icon={<SettingOutlined />} onClick={() => history.push('/main/customers/invoices/customize')}>Customize Template</Button>
        </Space>
      </div>

      <Card loading={loading}>
        {/* One <Form> for the whole document. The line-items table is driven by
            React state (not Form.Item), so it can live inside the form without
            registering anything. */}
        <Form form={form} layout="vertical" onValuesChange={handleFormValuesChange}>
          <FormSection title="Invoice Details" icon={<FileTextOutlined />}>
            <FormGrid>
              <FormCol>
                <Form.Item name="customer" label="Customer" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select customer' }]}>
                  <Select showSearch placeholder="Select customer"
                    autoFocus={customerOpen}
                    defaultOpen={customerOpen}
                    filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCustModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Customer</Button></>)}>
                    {customers.map(c => <Select.Option key={c.id} value={c.id}>{getCustomerName(c) || `Customer #${c.id}`}</Select.Option>)}
                  </Select>
                </Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="number" label="Invoice Number" style={FORM_ITEM_STYLE} rules={[{ pattern: /^[A-Za-z0-9\-\/]*$/, message: 'Only letters, numbers, hyphens and slashes allowed' }]}><Input placeholder="Auto-generated if blank" /></Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="terms" label="Payment Terms" style={FORM_ITEM_STYLE}>
                  <Select placeholder="Select terms" allowClear onChange={(v) => { const startDate = form.getFieldValue('start_date'); calcDueDate(startDate, v); }}>
                    <Select.Option value="Net 7">Net 7</Select.Option>
                    <Select.Option value="Net 15">Net 15</Select.Option>
                    <Select.Option value="Net 30">Net 30</Select.Option>
                    <Select.Option value="Net 45">Net 45</Select.Option>
                    <Select.Option value="Net 60">Net 60</Select.Option>
                    <Select.Option value="Due on Receipt">Due on Receipt</Select.Option>
                  </Select>
                </Form.Item>
              </FormCol>

              <FormCol>
                <Form.Item name="start_date" label="Invoice Date" style={FORM_ITEM_STYLE} initialValue={moment()}>
                  <DatePicker ref={dateRef} style={{ width: '100%' }} format="MM/DD/YYYY" onChange={(d) => { const terms = form.getFieldValue('terms'); calcDueDate(d, terms); }} />
                </Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="last_date" label="Due Date" style={FORM_ITEM_STYLE}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="customer_email" label="Email" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </FormCol>

              <FormCol span={2}>
                <Form.Item name="billing_address" label="Billing Address" style={FORM_ITEM_STYLE}><Input.TextArea rows={2} /></Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="vat" label="Tax Rate (%)" style={FORM_ITEM_STYLE} initialValue={0}>
                  <Select allowClear placeholder="Select Tax rate"
                    onChange={(v) => setVatPercent(Number(v) || 0)}
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setVatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Tax Rate</Button></>)}>
                    <Select.Option value={0}>No Tax (0%)</Select.Option>
                    {vatRates.map(v => <Select.Option key={v.id} value={v.vat_percentage}>{v.vat_name} ({v.vat_percentage}%)</Select.Option>)}
                  </Select>
                </Form.Item>
              </FormCol>

              {/* Read-only. Invoice status is derived from payments — there is
                  deliberately no status dropdown anywhere on this form. */}
              <FormCol>
                <Form.Item label="Status" style={FORM_ITEM_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
                    <InvoiceStatusBadge status={displayStatus} />
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>Set automatically from payments</span>
                  </div>
                </Form.Item>
              </FormCol>
            </FormGrid>
          </FormSection>

          <FormSection title="Line Items" icon={<UnorderedListOutlined />}>
            <Table dataSource={lines} columns={lineColumns} rowKey="key" size="small" pagination={false}
              scroll={{ x: 'max-content' }}
              footer={() => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={addLine}>Add Line</Button>
                  <TotalsBlock
                    rows={[
                      { label: 'Subtotal', value: `${cSym} ${subtotal.toFixed(2)}` },
                      vatPercent > 0 ? { label: `Tax (${vatPercent}%)`, value: `${cSym} ${vatAmount.toFixed(2)}` } : null,
                      { label: 'Total', value: `${cSym} ${grandTotal.toFixed(2)}`, strong: true },
                      (Number(paidToDate) || 0) > 0
                        ? { label: 'Paid to Date', value: `${cSym} ${Number(paidToDate).toFixed(2)}`, color: '#52c41a' }
                        : null,
                      (Number(paidToDate) || 0) > 0
                        ? { label: 'Balance Due', value: `${cSym} ${Math.max(0, grandTotal - (Number(paidToDate) || 0)).toFixed(2)}`, strong: true, color: '#fa541c' }
                        : null,
                      ((Number(paidToDate) || 0) - grandTotal) > 0.005
                        ? { label: 'Overpayment / Customer Credit', value: `${cSym} ${((Number(paidToDate) || 0) - grandTotal).toFixed(2)}`, strong: true, color: '#fa8c16' }
                        : null,
                    ]}
                  />
                </div>
              )}
            />
          </FormSection>

          <FormGrid columns={2}>
            <FormCol>
              <FormSection title="Message on Invoice" icon={<MessageOutlined />}>
                <Form.Item name="message" style={FORM_ITEM_STYLE}><Input.TextArea rows={2} /></Form.Item>
              </FormSection>
            </FormCol>
            <FormCol>
              <FormSection title="Statement Memo" icon={<FileTextOutlined />}>
                <Form.Item name="statement_message" style={FORM_ITEM_STYLE}><Input.TextArea rows={2} /></Form.Item>
              </FormSection>
            </FormCol>
          </FormGrid>

          <FormSection title="Actions" icon={<SaveOutlined />}>
            <DocumentActionBar
              left={<Button size="large" onClick={handleCancel}>Cancel</Button>}
            >
              <Button size="large" type="primary" icon={<SaveOutlined />} onClick={() => handleSave()} loading={saving}>
                {isEdit ? 'Update Invoice' : 'Save Invoice'}
              </Button>
              <Button size="large" icon={<MailOutlined />} onClick={handleSaveAndEmail} loading={saving}>
                {isEdit ? 'Update & Email' : 'Save & Email'}
              </Button>
            </DocumentActionBar>
          </FormSection>
        </Form>
      </Card>

      <Modal title="Add New Customer" visible={custModalOpen} onOk={handleAddCustomer} onCancel={() => setCustModalOpen(false)} okText="Add" destroyOnClose width={MODAL_WIDTH} bodyStyle={MODAL_BODY_SCROLL_STYLE}>
        <Form form={custForm} layout="vertical" preserve={false}>
          <CustomerContactFields
            form={custForm}
            vatRates={vatRates}
            address1Placeholder="123 Main St"
            address2Placeholder="Suite 100"
          />
        </Form>
      </Modal>

      <Modal title="Add New Product / Service" visible={prodModalOpen} onOk={handleAddProduct} onCancel={() => setProdModalOpen(false)} okText="Add" destroyOnClose width={700}>
        <Form form={prodForm} layout="horizontal" preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="Type" initialValue="Product" rules={[{ required: true }]} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Select>
                  <Select.Option value="Product">Product</Select.Option>
                  <Select.Option value="Service">Service</Select.Option>
                  <Select.Option value="Raw Material">Raw Material</Select.Option>
                  <Select.Option value="Asset">Asset</Select.Option>
                  <Select.Option value="Bundle">Bundle</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Input placeholder="e.g. Large Eggs" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="Category" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Select placeholder="Select category" allowClear
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                  {categories.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sku" label="SKU" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="price" label="Price" rules={[{ required: true }]} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix={cSym} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="income_account" label="Income Acct" rules={[{ required: true, message: 'Req' }]} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <AccountSelect accounts={incomeAccounts} placeholder="Select..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="description" label="Description" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Input placeholder="Brief description" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock" label="Stock Qty" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <InputNumber style={{ width: '100%' }} min={0} step={1} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal title="Add New Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={catForm} layout="vertical" preserve={false}>
          <Form.Item name="cat_name" label="Category Name" rules={[{ required: true, message: 'Enter category name' }]}>
            <Input placeholder="e.g. Electronics" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Add New Tax Rate" visible={vatModalOpen} onOk={handleAddVat} onCancel={() => setVatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={vatForm} layout="vertical" preserve={false}>
          <Form.Item name="vat_name" label="Tax Name" rules={[{ required: true }]}><Input placeholder="e.g. Standard Rate" /></Form.Item>
          <Form.Item name="vat_percentage" label="Percentage (%)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} step={0.5} /></Form.Item>
        </Form>
      </Modal>

      <SendEmailModal
        visible={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        recipientEmail={form.getFieldValue('customer_email') || ''}
        documentType="Invoice"
        documentNumber={form.getFieldValue('number') || ''}
        amount={`${cSym} ${lines.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2)}`}
              customerName={(() => { const c = customers.find(cu => cu.id === form.getFieldValue('customer')); return c ? getCustomerName(c) : ''; })()}
        companyName={company.name || company.company_name || ''}
        documentId={savedInvoiceId || (id ? Number(id) : null)}
      />
    </div>
  );
};

export default CreateInvoice;
