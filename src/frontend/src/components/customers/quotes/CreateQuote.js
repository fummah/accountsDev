import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Form, Input, InputNumber, Select, DatePicker, Button, Table, Space, message, Divider, Row, Col, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, SwapOutlined, FilePdfOutlined, PrinterOutlined, EyeOutlined, SettingOutlined, MailOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined, UnorderedListOutlined, MessageOutlined } from '@ant-design/icons';
import { handleDocumentPDF } from '../shared/generateDocumentPDF';
import SendEmailModal from '../shared/SendEmailModal';
import { useHistory, useParams, useLocation } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { ensureTrailingEmptyLine, removeLineItem, normalizeDocumentLines, collapseToSingleTrailingEmpty } from '../../../utils/lineItems';
import { confirmSavedDocumentEdit, confirmDocumentAction, useUnsavedChanges } from '../shared/documentEditGuard';
import CustomerContactFields from '../shared/CustomerContactFields';
import { deriveDisplayName } from '../../../utils/contactIdentity';
import { resolveTaxRateFields } from '../../../utils/taxRate';
import {
  FormSection, FormGrid, FormCol, DocumentActionBar, TotalsBlock, FORM_ITEM_STYLE,
  MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH, PAGE_WRAPPER_STYLE,
} from '../../shared/FormSection';
import { QuoteStatusBadge, normalizeStatus } from '../../StatusBadge';

const CreateQuote = () => {
  const { symbol: cSym } = useCurrency();
  const { id } = useParams();
  const history = useHistory();
  const location = useLocation();
  const isEdit = Boolean(id);

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.push('/main/customers/quotes/list');
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
  const [vatModalOpen, setVatModalOpen] = useState(false);
  const [quoteTemplate, setQuoteTemplate] = useState({});
  const [custForm] = Form.useForm();
  const [prodForm] = Form.useForm();
  const [vatForm] = Form.useForm();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [savedQuoteId, setSavedQuoteId] = useState(null);
  // Quote status is system controlled and only changes through workflow actions.
  const [quoteStatus, setQuoteStatus] = useState('Pending');
  const [convertedInvoiceId, setConvertedInvoiceId] = useState(null);
  const [convertedInvoiceNumber, setConvertedInvoiceNumber] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const armedRef = useRef(false);
  const formSnapshotRef = useRef(null);
  const navBypassRef = useRef(false);

  useUnsavedChanges(isDirty, navBypassRef);
  const [productCategories, setProductCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm] = Form.useForm();
  const [incomeAccounts, setIncomeAccounts] = useState([]);

  useEffect(() => {
    const fetchAccts = async () => {
      try {
        const accs = await window.electronAPI.getChartOfAccounts?.();
        const list = Array.isArray(accs) ? accs : (accs?.data || []);
        setIncomeAccounts(list.filter(a => (a.accountType || a.type || '').toLowerCase().includes('income')));
      } catch {}
    };
    fetchAccts();
  }, []);

  const loadCategories = async () => {
    try {
      const c = await window.electronAPI.getProductCategories?.();
      setProductCategories(Array.isArray(c) ? c : []);
    } catch {}
  };

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.insertProductCategory?.(vals.cat_name);
      if (res?.error) { message.error(res.error); return; }
      setCatModalOpen(false);
      catForm.resetFields();
      loadCategories();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add category'); }
  };

  const applyCustomer = (cust, rates = vatRates) => {
    if (!cust) return;
    const updates = {};
    if (cust.email && cust.email !== 'null') updates.customer_email = cust.email;
    const addrParts = [
      cust.address1, cust.address2,
      [cust.city, cust.state].filter(Boolean).join(', '),
      cust.postal_code || cust.zip
    ].filter(v => v && v !== 'null');
    if (addrParts.length > 0) updates.billing_address = addrParts.join('\n');
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
      }
    }
    form.setFieldsValue(updates);
  };

  const dateRef = useRef();

  const applyCustomerChange = (custId) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) applyCustomer(cust);
    setTimeout(() => dateRef.current?.focus(), 50);
  };

  // First material change on an already-saved quote → warn once per session.
  const runEditGuard = useCallback(async (apply) => {
    if (!isEdit || armedRef.current) { apply(); setIsDirty(true); return; }
    const ok = await confirmSavedDocumentEdit('Quote');
    if (ok) { armedRef.current = true; apply(); setIsDirty(true); }
  }, [isEdit]);

  const handleFormValuesChange = (changed) => {
    const isCustomer = Object.prototype.hasOwnProperty.call(changed, 'customer');
    const setCustomer = (v) => setSelectedCustomerId(v != null ? Number(v) : null);
    if (!isEdit) {
      if (isCustomer) { setCustomer(changed.customer); applyCustomerChange(changed.customer); }
      setIsDirty(true);
      return;
    }
    if (armedRef.current) {
      if (isCustomer) { setCustomer(changed.customer); applyCustomerChange(changed.customer); }
      setIsDirty(true);
      return;
    }
    const prevVals = formSnapshotRef.current || {};
    const prevCustomerId = selectedCustomerId;
    confirmSavedDocumentEdit('Quote').then((ok) => {
      if (ok) {
        armedRef.current = true;
        if (isCustomer) { setCustomer(changed.customer); applyCustomerChange(changed.customer); }
        formSnapshotRef.current = form.getFieldsValue();
        setIsDirty(true);
      } else {
        form.setFieldsValue(prevVals);
        if (Object.prototype.hasOwnProperty.call(changed, 'vat')) setVatPercent(Number(prevVals.vat) || 0);
        setSelectedCustomerId(prevCustomerId);
      }
    });
  };

  useEffect(() => {
    setLoading(true);
    loadDeps().then(() => {
      if (isEdit) return loadQuote();
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { if (prodModalOpen) loadCategories(); }, [prodModalOpen]);

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
      await window.electronAPI.insertProduct?.(
        vals.type || 'Product', vals.name || '', vals.sku || '', vals.category || '', vals.description || '',
        Number(vals.price) || 0, '', 0, 0, 0, null, Number(vals.stock) || 0
      );
      message.success('Product added');
      setProdModalOpen(false);
      prodForm.resetFields();
      const p = await window.electronAPI.getAllProducts?.();
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(prodArr);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add product'); }
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
      const [c, p, v] = await Promise.all([
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllProducts?.(),
        window.electronAPI.getAllVat?.(),
      ]);
      const custArr = Array.isArray(c) ? c : (c?.all || []);
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      const vatArr = Array.isArray(v) ? v : [];
      setCustomers(custArr);
      setProducts(prodArr);
      setVatRates(vatArr);

      const params = new URLSearchParams(location.search);
      const custId = params.get('customer');
      if (custId && !isEdit) {
        form.setFieldsValue({ customer: Number(custId) });
        const preselectCust = custArr.find(c => Number(c.id) === Number(custId));
        applyCustomer(preselectCust, vatArr);
      }
    } catch (err) { console.error('loadDeps error:', err); }
    // Load company info and invoice template separately so they never block the form
    try {
      const comp = await window.electronAPI.getCompany?.();
      if (comp) setCompany(comp);
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
      }
    } catch {}
    try {
      const tmpl = await window.electronAPI.getQuoteTemplate?.();
      if (tmpl && !tmpl.error) setQuoteTemplate(tmpl);
    } catch {}
  };

  const loadQuote = async () => {
    setLoading(true);
    try {
      const q = await window.electronAPI.getSingleQuote?.(id);
      if (q) {
        const custVal = q.customer_id || q.customer;
        setQuoteStatus(q.status || 'Pending');
        setConvertedInvoiceId(q.convertedInvoiceId || null);
        setConvertedInvoiceNumber(q.linkedInvoiceNumber || null);
        setSelectedCustomerId(custVal != null ? Number(custVal) : null);
        form.setFieldsValue({
          customer: custVal != null ? Number(custVal) : undefined,
          customer_email: q.customer_email,
          billing_address: q.billing_address,
          start_date: q.start_date ? moment(q.start_date) : null,
          last_date: q.last_date ? moment(q.last_date) : null,
          number: q.number,
          message: q.message,
          statement_message: q.statement_message,
          vat: q.vat != null ? Number(q.vat) : 0,
        });
        setVatPercent(q.vat != null ? Number(q.vat) : 0);
        if (Array.isArray(q.lines) && q.lines.length > 0) {
          // Drop any legacy blank rows before editing, then add exactly ONE
          // convenience row so the form never shows multiple empty lines.
          const loaded = normalizeDocumentLines(q.lines).map((l, i) => ({
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
        armedRef.current = false;
        setIsDirty(false);
        formSnapshotRef.current = form.getFieldsValue();
      }
    } catch { message.error('Failed to load quote'); }
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
    const rate = Number(prod.price || 0);
    const desc = prod.sales_description || prod.description || prod.name || '';
    // Sales tax defaults from the Item Master's Sales Tax Code when the quote has
    // no explicit rate yet. The line snapshots the rate on the backend too.
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
        return { ...l, description: desc, rate, amount: (l.quantity || 1) * rate, product_id: productId };
      });
      // Product selected → make sure a fresh empty line waits below.
      return ensureTrailingEmptyLine(updated, makeEmptyLine);
    }));
  };

  const [vatPercent, setVatPercent] = useState(0);
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vatAmount = subtotal * (Number(vatPercent) || 0) / 100;
  const grandTotal = subtotal + vatAmount;

  // Transition matrix (backend enforced; mirrored here for button visibility):
  //   Pending   → Accept ✓  Decline ✓  Convert ✓
  //   Accepted  → Accept ✗  Decline ✗  Convert ✓
  //   Declined  → all disabled
  //   Converted → all disabled (show "Converted to Invoice INV-xxxxx")
  const canonicalQuoteStatus = normalizeStatus(quoteStatus) || 'Pending';
  const isConverted = canonicalQuoteStatus === 'Converted';
  const canAccept = isEdit && canonicalQuoteStatus === 'Pending';
  const canDecline = isEdit && canonicalQuoteStatus === 'Pending';
  const canConvert = isEdit && (canonicalQuoteStatus === 'Pending' || canonicalQuoteStatus === 'Accepted');

  const handleSave = async (navigate = true) => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const customer = vals.customer;
      const customer_email = vals.customer_email || '';
      const billing_address = vals.billing_address || '';
      const start_date = vals.start_date ? vals.start_date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const last_date = vals.last_date ? vals.last_date.format('YYYY-MM-DD') : '';
      const msg = vals.message || '';
      const statement_message = vals.statement_message || '';
      const number = vals.number || '';
      const vat = Number(vals.vat) || 0;
      // Only MEANINGFUL lines are saved — the blank convenience row (and any
      // legacy blank row) is UI-only and must never become a document line.
      const quoteLines = normalizeDocumentLines(lines).map(l => ({
        description: l.description || '',
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        amount: Number(l.amount) || 0,
        product_id: l.product_id || null,
      }));

      // Validate that every line has a product selected
      if (quoteLines.length === 0) {
        message.error('Please add at least one line item');
        return null;
      }
      const missingProduct = quoteLines.find(l => !l.product_id);
      if (missingProduct) {
        message.error('Please select a product from the dropdown for each line item. All lines must have a product selected from the system.');
        return null;
      }

      let savedId = null;
      const existingId = savedQuoteId || (id ? Number(id) : null);
      if (existingId) {
        // Status is intentionally NOT sent: the backend owns the quote lifecycle
        // state and the normal edit form can never rewrite it.
        const res = await window.electronAPI.updateQuote?.({
          id: existingId,
          customer, customer_email, billing_address,
          start_date, last_date, message: msg, statement_message, number, vat, quoteLines,
        });
        if (res?.error) { message.error(typeof res.error === 'string' ? res.error : 'Update failed'); return null; }
        if (res?.status) setQuoteStatus(res.status);
        message.success('Quote updated');
        savedId = existingId;
        setSavedQuoteId(savedId);
      } else {
        // `undefined` status → backend creates the quote Pending (active).
        const res = await window.electronAPI.insertQuote?.(
          undefined,
          customer, customer_email, false, billing_address,
          start_date, last_date, msg, statement_message, number,
          null, vat, quoteLines
        );
        if (res?.error) { message.error(typeof res.error === 'string' ? res.error : 'Insert failed'); return null; }
        if (res?.success === false) { message.error('Failed to create quote'); return null; }
        savedId = Number(res?.quoteId || res?.quote_id || res?.id);
        if (savedId) setSavedQuoteId(savedId);
        setQuoteStatus(res?.status || 'Pending');
        message.success('Quote created');
      }
      setIsDirty(false);
      armedRef.current = false;
      formSnapshotRef.current = form.getFieldsValue();
      if (navigate) {
        navBypassRef.current = true;
        history.push('/main/customers/quotes/list');
      }
      return savedId;
    } catch (e) {
      if (e?.errorFields) return null;
      message.error('Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndEmail = async () => {
    const savedId = await handleSave(false);
    if (savedId) setEmailModalOpen(true);
  };

  // Cancel never saves. Leaving the page is already guarded by
  // useUnsavedChanges(): when the form is dirty the existing "Unsaved changes"
  // modal asks before discarding, and when it is pristine we simply go back.
  // No second, competing warning system is introduced here.
  const handleCancel = handleBack;

  // ── Quote workflow actions (status is never set by hand) ──────────────────
  // Status actions always operate on the persisted quote, so any unsaved edits
  // must be saved first — otherwise the transition would silently discard them.
  const persistBeforeAction = async () => {
    if (!isDirty) return true;
    const ok = await confirmDocumentAction({
      title: 'Save changes first?',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>This quote has unsaved changes.</p>
          <p style={{ margin: 0 }}>Status actions always apply to the saved version, so your changes need to be saved first.</p>
        </div>
      ),
      okText: 'Save and continue',
      cancelText: 'Cancel',
    });
    if (!ok) return false;
    const savedId = await handleSave(false);
    return Boolean(savedId);
  };

  const quoteNumberLabel = () => form.getFieldValue('number') || (id ? `QUO-${String(id).padStart(5, '0')}` : 'this quote');

  const handleAccept = async () => {
    if (!isEdit || !canAccept) return;
    const idNum = Number(id);
    if (!(await persistBeforeAction())) return;
    const ok = await confirmDocumentAction({
      title: 'Accept quote?',
      content: <span>Quote <strong>#{quoteNumberLabel()}</strong> will be marked as <strong>Accepted</strong>.</span>,
      okText: 'Accept Quote',
    });
    if (!ok) return;
    setActionBusy(true);
    try {
      const res = await window.electronAPI.acceptQuote?.(idNum);
      if (res?.error || res?.success === false) {
        message.error(typeof res?.error === 'string' ? res.error : 'Failed to accept quote');
        return;
      }
      setQuoteStatus(res?.status || 'Accepted');
      message.success('Quote marked as Accepted');
    } catch { message.error('Failed to accept quote'); }
    finally { setActionBusy(false); }
  };

  const handleDecline = async () => {
    if (!isEdit || !canDecline) return;
    const idNum = Number(id);
    if (!(await persistBeforeAction())) return;
    const ok = await confirmDocumentAction({
      title: 'Decline quote?',
      content: <span>Quote <strong>#{quoteNumberLabel()}</strong> will be marked as <strong>Declined</strong>.</span>,
      okText: 'Decline Quote',
      okDanger: true,
    });
    if (!ok) return;
    setActionBusy(true);
    try {
      const res = await window.electronAPI.declineQuote?.(idNum);
      if (res?.error || res?.success === false) {
        message.error(typeof res?.error === 'string' ? res.error : 'Failed to decline quote');
        return;
      }
      setQuoteStatus(res?.status || 'Declined');
      message.success('Quote marked as Declined');
    } catch { message.error('Failed to decline quote'); }
    finally { setActionBusy(false); }
  };

  const handleConvert = async () => {
    if (!isEdit || !canConvert) return;
    const idNum = Number(id);
    if (!(await persistBeforeAction())) return;
    const ok = await confirmDocumentAction({
      title: 'Convert quote to invoice?',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>A new invoice will be created from quote <strong>#{quoteNumberLabel()}</strong>.</p>
          <p style={{ margin: 0 }}>The quote will be marked as <strong>Converted</strong>. This cannot be undone.</p>
        </div>
      ),
      okText: 'Convert to Invoice',
    });
    if (!ok) return;
    setActionBusy(true);
    try {
      const res = await window.electronAPI.convertQuoteToInvoice?.(idNum);
      if (res?.alreadyConverted) {
        setQuoteStatus('Converted');
        if (res.invoiceId) setConvertedInvoiceId(res.invoiceId);
        message.warning(typeof res.error === 'string' ? res.error : 'This quote has already been converted.');
        return;
      }
      if (res?.error || res?.success === false) {
        message.error(typeof res?.error === 'string' ? res.error : 'Conversion failed');
        return;
      }
      setQuoteStatus(res?.quoteStatus || 'Converted');
      setConvertedInvoiceId(res?.invoiceId || null);
      setConvertedInvoiceNumber(res?.invoiceNumber || null);
      setIsDirty(false);
      armedRef.current = false;
      message.success(`Quote converted to invoice${res?.invoiceNumber ? ` ${res.invoiceNumber}` : ''}`);
    } catch { message.error('Conversion failed'); }
    finally { setActionBusy(false); }
  };

  const doPDF = (action) => {
    const vals = form.getFieldsValue();
    const cust = customers.find(c => c.id === (vals.customer));
    handleDocumentPDF(action, {
      docType: 'Quote',
      header: {
        number: vals.number || '',
        status: isEdit ? canonicalQuoteStatus : 'Pending',
        date: vals.start_date ? vals.start_date.format('MM/DD/YYYY') : '',
        dueDate: vals.last_date ? vals.last_date.format('MM/DD/YYYY') : '',
        customerName: cust ? (cust.display_name || cust.name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim()) : '',
        email: vals.customer_email || '',
        billingAddress: vals.billing_address || '',
      },
      lines: normalizeDocumentLines(lines),
      subtotal,
      vatPercent: Number(vatPercent) || 0,
      vatAmount,
      grandTotal,
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
      templateSettings: quoteTemplate,
    });
  };

  const customerOpen = !isEdit && !new URLSearchParams(location.search).get('customer');

  const lineColumns = [
    { title: 'Product', key: 'product', width: 180,
      render: (_, r) => (
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
    { title: '', key: 'actions', width: 50,
      render: (_, r) => lines.length > 1 ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} /> : null },
  ];

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-page-head-left">
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ borderRadius: 8, color: '#595959', borderColor: '#d9d9d9' }}>Back</Button>
          <h2>{isEdit ? `Edit Quote #${form.getFieldValue('number') || id}` : 'Create Quote'}</h2>
          <QuoteStatusBadge status={isEdit ? canonicalQuoteStatus : 'Pending'} />
          {isEdit && (<>
            <Button className="gx-btn-success" icon={<CheckCircleOutlined />} disabled={!canAccept} loading={actionBusy} onClick={handleAccept}>Accept Quote</Button>
            <Button className="gx-btn-danger" icon={<CloseCircleOutlined />} disabled={!canDecline} loading={actionBusy} onClick={handleDecline}>Decline Quote</Button>
            <Button className="gx-btn-primary" icon={<SwapOutlined />} disabled={!canConvert} loading={actionBusy} onClick={handleConvert}>Convert to Invoice</Button>
          </>)}
        </div>
        <Space wrap>
          <Button className="gx-btn-secondary" icon={<UserOutlined />} disabled={!selectedCustomerId} onClick={() => history.push(`/main/customers/details/${selectedCustomerId}`)}>View Customer</Button>
          {isEdit && (<>
            <Button className="gx-btn-info" icon={<EyeOutlined />} onClick={() => doPDF('preview')}>Preview</Button>
            <Button className="gx-btn-danger" icon={<FilePdfOutlined />} onClick={() => doPDF('download')}>Download PDF</Button>
            <Button className="gx-btn-warning" icon={<PrinterOutlined />} onClick={() => doPDF('print')}>Print</Button>
          </>)}
          <Button className="gx-btn-primary-light" icon={<SettingOutlined />} onClick={() => history.push('/main/customers/quotes/customize')}>Customize Template</Button>
        </Space>
      </div>

      {isEdit && isConverted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#f9f0ff', border: '1px solid #d3adf7' }}>
          <SwapOutlined style={{ color: '#722ed1' }} />
          <span style={{ color: '#391085' }}>
            Converted to Invoice <strong>{convertedInvoiceNumber || (convertedInvoiceId ? `INV-${convertedInvoiceId}` : '')}</strong>
          </span>
          {convertedInvoiceId && (
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => history.push(`/main/customers/invoices/edit/${convertedInvoiceId}`)}>
              View Invoice
            </Button>
          )}
        </div>
      )}

      <Card loading={loading}>
        {/* One <Form> for the whole document. The line-items table is driven by
            React state (not Form.Item), so it can live inside the form without
            registering anything. */}
        <Form form={form} layout="vertical" onValuesChange={handleFormValuesChange}>
          <FormSection title="Quote Details" icon={<FileTextOutlined />}>
            <FormGrid>
              <FormCol>
                <Form.Item name="customer" label="Customer" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select customer' }]}>
                  <Select showSearch placeholder="Select customer"
                    autoFocus={customerOpen}
                    defaultOpen={customerOpen}
                    filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCustModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Customer</Button></>)}>
                    {customers.map(c => <Select.Option key={c.id} value={c.id}>{c.display_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Select.Option>)}
                  </Select>
                </Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="number" label="Quote Number" style={FORM_ITEM_STYLE} rules={[{ pattern: /^[A-Za-z0-9\-\/]*$/, message: 'Only letters, numbers, hyphens and slashes allowed' }]}><Input placeholder="Auto-generated if blank" /></Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="customer_email" label="Email" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </FormCol>

              <FormCol>
                <Form.Item name="start_date" label="Quote Date" style={FORM_ITEM_STYLE} initialValue={moment()}>
                  <DatePicker ref={dateRef} style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </FormCol>
              <FormCol>
                <Form.Item name="last_date" label="Expiry Date" style={FORM_ITEM_STYLE}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
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

              {/* Multi-line to match the joined "address1 / city, state / zip"
                  string the customer record supplies. */}
              <FormCol span={2}>
                <Form.Item name="billing_address" label="Address" style={FORM_ITEM_STYLE}><Input.TextArea rows={2} /></Form.Item>
              </FormCol>

              {/* Read-only. Quote status is owned by the workflow actions
                  (Accept / Decline / Convert) — never a dropdown. */}
              <FormCol>
                <Form.Item label="Status" style={FORM_ITEM_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
                    <QuoteStatusBadge status={isEdit ? canonicalQuoteStatus : 'Pending'} />
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>Controlled by workflow actions</span>
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
                    ]}
                  />
                </div>
              )}
            />
          </FormSection>

          <FormGrid columns={2}>
            <FormCol>
              <FormSection title="Message on Quote" icon={<MessageOutlined />}>
                {/* The card heading is the field's label; aria-label keeps the
                    control's accessible name. */}
                <Form.Item name="message" style={FORM_ITEM_STYLE}>
                  <Input.TextArea rows={2} aria-label="Message on Quote" />
                </Form.Item>
              </FormSection>
            </FormCol>
            <FormCol>
              <FormSection title="Statement Memo" icon={<FileTextOutlined />}>
                <Form.Item name="statement_message" style={FORM_ITEM_STYLE}>
                  <Input.TextArea rows={2} aria-label="Statement Memo" />
                </Form.Item>
              </FormSection>
            </FormCol>
          </FormGrid>

          <FormSection title="Actions" icon={<SaveOutlined />}>
            <DocumentActionBar
              left={<Button size="large" onClick={handleCancel}>Cancel</Button>}
            >
              <Button size="large" type="primary" icon={<SaveOutlined />} onClick={() => handleSave()} loading={saving}>
                {isEdit ? 'Update Quote' : 'Save Quote'}
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

      <Modal title="Add New Product" visible={prodModalOpen} onOk={handleAddProduct} onCancel={() => setProdModalOpen(false)} okText="Add" destroyOnClose afterClose={() => prodForm.resetFields()}>
        <Form form={prodForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="Type" initialValue="Product" rules={[{ required: true }]}>
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
              <Form.Item name="name" label="Product Name" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear placeholder="Select category"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                  {productCategories.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sku" label="SKU"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="price" label="Selling Price" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix={cSym} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock" label="Stock Qty"><InputNumber style={{ width: '100%' }} min={0} step={1} /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal title="Add New Tax Rate" visible={vatModalOpen} onOk={handleAddVat} onCancel={() => setVatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={vatForm} layout="vertical" preserve={false}>
          <Form.Item name="vat_name" label="Tax Name" rules={[{ required: true }]}><Input placeholder="e.g. Standard Rate" /></Form.Item>
          <Form.Item name="vat_percentage" label="Percentage (%)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} step={0.5} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Add New Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={catForm} layout="vertical" preserve={false}>
          <Form.Item name="cat_name" label="Category Name" rules={[{ required: true, message: 'Enter category name' }]}>
            <Input placeholder="e.g. Electronics" />
          </Form.Item>
        </Form>
      </Modal>

      <SendEmailModal
        visible={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        recipientEmail={form.getFieldValue('customer_email') || ''}
        documentType="Quote"
        documentNumber={form.getFieldValue('number') || ''}
        amount={`${cSym} ${lines.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2)}`}
        customerName={(() => { const c = customers.find(cu => cu.id === form.getFieldValue('customer')); return c ? (c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : ''; })()}
        companyName={company.name || company.company_name || ''}
        documentId={savedQuoteId || (id ? Number(id) : null)}
      />
    </div>
  );
};

export default CreateQuote;
