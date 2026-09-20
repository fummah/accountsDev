import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, message,
  Drawer, Tabs, Tag, Badge, Progress, Row, Col, Statistic, Popconfirm,
  Timeline, Divider, Empty, Alert, InputNumber, DatePicker, Tooltip,
  Radio, Spin,
} from 'antd';
import { useCurrency } from '../../utils/currency';
import { ensureTrailingEmptyLine } from '../../utils/lineItems';
import { Z } from '../../utils/layers';
import CustomerContactFields, { CONTACT_FIELD_NAMES } from './shared/CustomerContactFields';
import SendEmailModal from './shared/SendEmailModal';
import { QuoteStatusBadge, normalizeStatus } from '../StatusBadge';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined,
  PhoneOutlined, MailOutlined, GlobalOutlined, EnvironmentOutlined,
  ClockCircleOutlined, CheckCircleOutlined, WarningOutlined,
  CalendarOutlined, BarChartOutlined, FunnelPlotOutlined, TeamOutlined,
  TrophyOutlined, ReloadOutlined, SearchOutlined, LinkOutlined, UserOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import moment from 'moment';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const STAGES = [
  { key: 'new',         label: 'New Lead',      color: '#8c8c8c' },
  { key: 'contacted',   label: 'Contacted',     color: '#1890ff' },
  { key: 'qualified',   label: 'Qualified',     color: '#722ed1' },
  { key: 'proposal',    label: 'Proposal Sent', color: '#fa8c16' },
  { key: 'negotiation', label: 'Negotiation',   color: '#eb2f96' },
  { key: 'won',         label: 'Won',           color: '#52c41a' },
  { key: 'lost',        label: 'Lost',          color: '#f5222d' },
];
const SOURCES    = ['Website','Referral','Cold Call','Social Media','Email Campaign','Trade Show','Advertisement','Partner','Other'];
const PRIORITIES = [
  { key: 'high',   label: 'High',   color: '#f5222d' },
  { key: 'medium', label: 'Medium', color: '#fa8c16' },
  { key: 'low',    label: 'Low',    color: '#52c41a' },
];
const ACT_TYPES  = ['call','meeting','email','task','note'];
const ACT_ICONS  = { call: '📞', meeting: '🤝', email: '📧', task: '✅', note: '📝' };
const PIE_COLORS = ['#1890ff','#52c41a','#fa8c16','#f5222d','#722ed1','#eb2f96','#13c2c2','#faad14'];

const stageMap = Object.fromEntries(STAGES.map(s => [s.key, s]));
const prioMap  = Object.fromEntries(PRIORITIES.map(p => [p.key, p]));

// How a lead's contact identity is established.
const MODE_EXISTING = 'existing';   // pick an existing Customer (linked by id)
const MODE_SCRATCH  = 'scratch';    // capture contact details from scratch

/** Compose the legacy free-text `address` column from the structured parts. */
const composeAddress = (c = {}) => {
  if (!c) return '';
  if (c.address1 || c.address2 || c.city || c.state || c.postal_code || c.country) {
    return [c.address1, c.address2, [c.city, c.state, c.postal_code].filter(Boolean).join(' '), c.country]
      .filter(Boolean).join(', ');
  }
  return c.address || '';
};

/** The customer contact columns, copied 1:1 onto the lead's own columns. */
const contactFieldsFromCustomer = (c = {}) => ({
  first_name:     c.first_name     || '',
  last_name:      c.last_name      || '',
  display_name:   c.display_name   || '',
  company_name:   c.company_name   || '',
  email:          c.email          || '',
  phone_number:   c.phone_number   || '',
  mobile_number:  c.mobile_number  || '',
  address1:       c.address1       || '',
  address2:       c.address2       || '',
  city:           c.city           || '',
  state:          c.state          || '',
  postal_code:    c.postal_code    || '',
  country:        c.country        || '',
  website:        c.website        || '',
  // Legacy mirrored columns, kept in sync so the kanban / list / drawer keep working.
  company:        c.company_name   || '',
  phone:          c.phone_number   || c.mobile_number || '',
  address:        composeAddress(c),
});

const Leads = () => {
  const { symbol: cSym } = useCurrency();
  const fmtMoney = v => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [activeTab, setActiveTab]             = useState('pipeline');
  const [leads, setLeads]                     = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [filters, setFilters]                 = useState({});
  const [pipelineStats, setPipelineStats]     = useState(null);
  const [reports, setReports]                 = useState(null);
  const [overdueActs, setOverdueActs]         = useState([]);
  const [upcomingActs, setUpcomingActs]       = useState([]);

  const [drawerLead, setDrawerLead]           = useState(null);
  const [drawerTab, setDrawerTab]             = useState('info');
  const [drawerActs, setDrawerActs]           = useState([]);
  const [drawerLoading, setDrawerLoading]     = useState(false);

  const [leadModalOpen, setLeadModalOpen]     = useState(false);
  const [editingLead, setEditingLead]         = useState(null);
  const [actModalOpen, setActModalOpen]       = useState(false);
  const [editingAct, setEditingAct]           = useState(null);
  const [convertTarget, setConvertTarget]     = useState(null);
  const [quoteModalOpen, setQuoteModalOpen]   = useState(false);
  const [quoteLeadId, setQuoteLeadId]         = useState(null);
  const [leadQuotes, setLeadQuotes]           = useState([]);
  const [quoteLines, setQuoteLines]           = useState([{ description:'', quantity:1, rate:0, amount:0 }]);
  const [convertThenQuote, setConvertThenQuote] = useState(false);
  // Quote created from the modal → optional immediate email (same shared modal
  // the standard Create Quote screen uses).
  const [emailModalOpen, setEmailModalOpen]   = useState(false);
  const [emailTarget, setEmailTarget]         = useState(null);

  const [draggedLead, setDraggedLead]         = useState(null);
  const [dragOverStage, setDragOverStage]     = useState(null);
  const [selectedKeys, setSelectedKeys]       = useState([]);
  const [employees, setEmployees]             = useState([]);
  const [empModalOpen, setEmpModalOpen]       = useState(false);
  const [products, setProducts]               = useState([]);
  // Saved tax entities (the `vat` table) for the lead-quote tax dropdown.
  const [vatRates, setVatRates]               = useState([]);
  const [leadQuoteVatPercent, setLeadQuoteVatPercent] = useState(0);
  const [vatModalOpen, setVatModalOpen]       = useState(false);

  const [leadForm]  = Form.useForm();
  const [actForm]   = Form.useForm();
  const [quoteForm] = Form.useForm();
  const [empForm]   = Form.useForm();
  const [vatForm]   = Form.useForm();

  const history = useHistory();

  // ── New/Edit Lead: creation mode + existing-customer picker ──────────────────
  // mode determines whether the lead is linked to an existing Customer by id,
  // or whether its contact details are captured from scratch.
  const [createMode, setCreateMode]           = useState(MODE_EXISTING);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer]   = useState(null);
  const [duplicateWarning, setDuplicateWarning]   = useState(null);
  const customerSearchTimer = useRef(null);

  // Server-side customer search (there are 60k+ customers — never load them all).
  const searchCustomers = useCallback((term) => {
    if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current);
    customerSearchTimer.current = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const res = await window.electronAPI.getCustomersPaginated?.(1, 25, term || '', '');
        setCustomerOptions(Array.isArray(res?.data) ? res.data : []);
      } catch (_) { setCustomerOptions([]); }
      finally { setCustomerSearching(false); }
    }, 300);
  }, []);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.crmListLeads(filters);
      setLeads(Array.isArray(data) ? data : []);
    } catch (_) { message.error('Failed to load leads'); }
    finally { setLoading(false); }
  }, [filters]);

  const fetchMeta = useCallback(async () => {
    try {
      const [stats, rpts, over, up] = await Promise.all([
        window.electronAPI.crmPipelineStats(),
        window.electronAPI.crmReports(),
        window.electronAPI.crmOverdueActivities(),
        window.electronAPI.crmUpcomingActivities(7),
      ]);
      if (stats && !stats.error) setPipelineStats(stats);
      if (rpts  && !rpts.error)  setReports(rpts);
      if (Array.isArray(over)) setOverdueActs(over);
      if (Array.isArray(up))   setUpcomingActs(up);
    } catch (_) {}
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await window.electronAPI.getEmployees?.();
      // Backend returns { success, data: [...] } not a plain array
      if (res?.data && Array.isArray(res.data)) setEmployees(res.data);
      else if (Array.isArray(res)) setEmployees(res);
      else setEmployees([]);
    } catch {}
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const p = await window.electronAPI.getAllProducts?.();
      setProducts(Array.isArray(p) ? p : (p?.all || []));
    } catch {}
  }, []);

  // The tax entities a lead quote can be linked to (the same `vat` rates the
  // standard Create Quote screen offers).
  const fetchVatRates = useCallback(async () => {
    try {
      const v = await window.electronAPI.getAllVat?.();
      setVatRates(Array.isArray(v) ? v : []);
    } catch { setVatRates([]); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchMeta(); },  [fetchMeta]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchVatRates(); }, [fetchVatRates]);

  const handleAddVat = async () => {
    try {
      const vals = await vatForm.validateFields();
      await window.electronAPI.insertVat?.(vals.vat_name || '', Number(vals.vat_percentage) || 0, null);
      message.success('Tax rate added');
      setVatModalOpen(false);
      vatForm.resetFields();
      await fetchVatRates();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add Tax rate'); }
  };

  const fetchDrawerActs = async (leadId) => {
    setDrawerLoading(true);
    try {
      const data = await window.electronAPI.crmListActivities({ leadId });
      setDrawerActs(Array.isArray(data) ? data : []);
    } finally { setDrawerLoading(false); }
  };

  const openDrawer = async (lead) => {
    setDrawerLead(lead); setDrawerTab('info');
    await Promise.all([fetchDrawerActs(lead.id), fetchLeadQuotes(lead.id)]);
  };

  const refresh = () => { fetchLeads(); fetchMeta(); };

  // ── Lead CRUD ────────────────────────────────────────────────────────────────
  const resetLeadModeState = (mode = MODE_EXISTING) => {
    setCreateMode(mode);
    setSelectedCustomerId(null);
    setSelectedCustomer(null);
    setDuplicateWarning(null);
    setCustomerOptions([]);
  };

  const openNewLead = () => {
    setEditingLead(null);
    leadForm.resetFields();
    resetLeadModeState(MODE_EXISTING);
    searchCustomers('');           // seed the picker with the first page
    setLeadModalOpen(true);
  };

  const openEditLead = (lead) => {
    setEditingLead(lead);
    const linkedId = lead.customer_id || null;
    setCreateMode(linkedId ? MODE_EXISTING : MODE_SCRATCH);
    setSelectedCustomerId(linkedId);
    setSelectedCustomer(linkedId ? {
      id: linkedId,
      display_name: lead.linked_customer_name || lead.customer_name || `Customer #${linkedId}`,
      email: lead.linked_customer_email || '',
      company_name: lead.linked_customer_company || '',
    } : null);
    setDuplicateWarning(null);
    leadForm.setFieldsValue({
      ...lead,
      customer_id: linkedId,
      tags: lead.tags ? (typeof lead.tags === 'string' ? (() => { try { return JSON.parse(lead.tags); } catch { return []; } })() : lead.tags) : [],
      expected_close_date: lead.expected_close_date ? moment(lead.expected_close_date) : null,
    });
    if (linkedId) searchCustomers('');
    setLeadModalOpen(true);
  };

  /**
   * Switch between "Existing Customer" and "New / From Scratch".
   * Mode-specific values are cleared so a stale link or a stale contact block
   * can never leak into the saved record. If the form already holds meaningful
   * data we ask before clearing it.
   */
  const handleModeChange = (nextMode) => {
    if (nextMode === createMode) return;
    const apply = () => {
      if (nextMode === MODE_EXISTING) {
        // Leaving scratch: drop the scratch contact block, keep lead-only fields.
        const cleared = { customer_id: undefined };
        CONTACT_FIELD_NAMES.forEach(f => { cleared[f] = undefined; });
        leadForm.setFieldsValue(cleared);
        setDuplicateWarning(null);
        searchCustomers('');
      } else {
        // Leaving "existing": drop the link so we never half-link a scratch lead.
        setSelectedCustomerId(null);
        setSelectedCustomer(null);
        leadForm.setFieldsValue({ customer_id: undefined });
      }
      setCreateMode(nextMode);
    };

    const hasData = CONTACT_FIELD_NAMES.some(f => {
      const v = leadForm.getFieldValue(f);
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
    const hasLink = createMode === MODE_EXISTING && !!selectedCustomerId;

    if (hasData || hasLink) {
      Modal.confirm({
        title: 'Switch creation mode?',
        content: 'The details captured for the current mode will be cleared.',
        okText: 'Switch',
        cancelText: 'Keep editing',
        // The New Lead dialog is Z.MODAL (1050); the confirm must clear it.
        zIndex: Z.CONFIRM,
        onOk: apply,
      });
    } else {
      apply();
    }
  };

  /** Pick an existing customer → link by id and prefill the lead's contact copy. */
  const handleSelectCustomer = async (customerId) => {
    setSelectedCustomerId(customerId || null);
    if (!customerId) { setSelectedCustomer(null); return; }
    try {
      const full = await window.electronAPI.getSingleCustomer?.(customerId);
      if (!full || full.error) throw new Error('Customer not found');
      setSelectedCustomer(full);
      leadForm.setFieldsValue({
        customer_id: customerId,
        ...contactFieldsFromCustomer(full),
        // Never touch lead-only fields (stage, priority, value, source…).
      });
    } catch (e) {
      message.error('Could not load that customer');
      setSelectedCustomerId(null);
    }
  };
  const goToCustomer = (customerId) => {
    if (!customerId) return;
    history.push(`/main/customers/details/${customerId}`);
  };

  // Human-readable label for the currently linked customer.
  const selectedCustomerName = selectedCustomer
    ? (selectedCustomer.display_name
       || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim()
       || selectedCustomer.company_name
       || `Customer #${selectedCustomerId}`)
    : `Customer #${selectedCustomerId}`;

  /**
   * Duplicate guard for "from scratch": if a customer already exists with the
   * same email, surface it rather than silently creating a parallel record.
   */
  const checkDuplicateCustomer = useCallback(async (email) => {
    const term = String(email || '').trim();
    if (!term) { setDuplicateWarning(null); return; }
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(1, 5, term, '');
      const rows = Array.isArray(res?.data) ? res.data : [];
      const exact = rows.find(r => String(r.email || '').toLowerCase() === term.toLowerCase());
      setDuplicateWarning(exact ? { id: exact.id, name: exact.display_name || `${exact.first_name || ''} ${exact.last_name || ''}`.trim() || exact.company_name } : null);
    } catch (_) { setDuplicateWarning(null); }
  }, []);

  /** Duplicate found → adopt the existing customer as the lead's link. */
  const linkDuplicateCustomer = async (id) => {
    setCreateMode(MODE_EXISTING);
    setDuplicateWarning(null);
    searchCustomers('');
    leadForm.setFieldsValue({ customer_id: id });
    await handleSelectCustomer(id);
  };

  const handleSaveLead = async () => {
    try {
      const v = await leadForm.validateFields();
      const payload = {
        ...v,
        tags: v.tags || [],
        expected_close_date: v.expected_close_date ? v.expected_close_date.format('YYYY-MM-DD') : null,
        // Explicitly send customer_id (including null) so a mode switch
        // reliably links or unlinks the lead.
        customer_id: createMode === MODE_EXISTING ? (selectedCustomerId || null) : null,
      };
      if (editingLead) { await window.electronAPI.crmUpdateLead({ ...editingLead, ...payload }); message.success('Lead updated'); }
      else             { await window.electronAPI.crmCreateLead(payload); message.success('Lead created'); }
      setLeadModalOpen(false); refresh();
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Save failed'); }
  };
  const handleDeleteLead = async (id) => {
    const res = await window.electronAPI.crmDeleteLead(id);
    if (res?.success) { message.success('Lead deleted'); refresh(); }
    else message.error(res?.error || 'Delete failed');
  };

  const handleAddEmployee = async () => {
    try {
      const vals = await empForm.validateFields();
      await window.electronAPI.insertEmployee?.({
        first_name: vals.first_name || '',
        last_name: vals.last_name || '',
        email: vals.email || '',
        phone: vals.phone || '',
        department: vals.department || '',
        position: vals.position || '',
      });
      message.success('Employee added');
      setEmpModalOpen(false);
      empForm.resetFields();
      await fetchEmployees();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add employee'); }
  };

  // ── Kanban drag-drop ─────────────────────────────────────────────────────────
  const handleDrop = async (stage) => {
    if (!draggedLead || draggedLead.pipeline_stage === stage) { setDraggedLead(null); setDragOverStage(null); return; }
    await window.electronAPI.crmUpdateLeadStage(draggedLead.id, stage);
    setDraggedLead(null); setDragOverStage(null); refresh();
  };

  // ── Activity CRUD ────────────────────────────────────────────────────────────
  const openNewActivity = (leadId) => {
    setEditingAct({ leadId }); actForm.resetFields();
    actForm.setFieldsValue({ type: 'call', status: 'open' }); setActModalOpen(true);
  };
  const handleSaveActivity = async () => {
    try {
      const v = await actForm.validateFields();
      const payload = { ...editingAct, ...v, dueDate: v.dueDate ? v.dueDate.toISOString() : null };
      if (payload.id) await window.electronAPI.crmUpdateActivity(payload);
      else            await window.electronAPI.crmCreateActivity(payload);
      message.success('Activity saved'); setActModalOpen(false);
      if (drawerLead) fetchDrawerActs(drawerLead.id);
      fetchMeta();
    } catch (e) { if (!e?.errorFields) message.error('Save failed'); }
  };
  const completeActivity = async (act) => {
    await window.electronAPI.crmUpdateActivity({ ...act, status: 'done' });
    if (drawerLead) fetchDrawerActs(drawerLead.id); fetchMeta();
  };

  // ── Quote flow ─────────────────────────────────────────────────────────────
  const openQuoteModal = async (lead) => {
    setQuoteLeadId(lead.id);
    setQuoteLines([{ description:'', quantity:1, rate:0, amount:0 }]);
    quoteForm.resetFields();
    quoteForm.setFieldsValue({
      // No status field: a lead quote is always created Pending, exactly like
      // the standard Create Quote screen. Status only moves via workflow actions.
      q_email: lead.email || '',
      q_billing: lead.address || '',
      q_start: moment(),
      q_end: moment().add(30,'days'),
      q_vat: 0,
      q_message: '',
    });
    setLeadQuoteVatPercent(0);
    setQuoteModalOpen(true);
  };

  const fetchLeadQuotes = async (leadId) => {
    try {
      const data = await window.electronAPI.crmGetLeadQuotes(leadId);
      setLeadQuotes(Array.isArray(data) ? data : []);
    } catch (_) { setLeadQuotes([]); }
  };

  const updateLine = (idx, field, val) => {
    setQuoteLines(prev => {
      const next = prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: val };
        if (field === 'quantity' || field === 'rate') {
          updated.amount = Number(updated.quantity || 1) * Number(updated.rate || 0);
        }
        return updated;
      });
      return next;
    });
  };

  const makeEmptyQuoteLine = () => ({ description: '', quantity: 1, rate: 0, amount: 0, product_id: null });

  const selectProduct = (idx, productId) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return; // clearing the dropdown must not auto-add a line
    const rate = Number(prod.selling_price || prod.price || 0);
    setQuoteLines(prev => {
      const updated = prev.map((l, i) => {
        if (i !== idx) return l;
        return { ...l, description: prod.name || prod.description, rate, amount: (l.quantity || 1) * rate, product_id: productId };
      });
      // Product selected → make sure a fresh empty line waits below.
      return ensureTrailingEmptyLine(updated, makeEmptyQuoteLine);
    });
  };

  // Shared create step for "Create Quote" and "Create & Email".
  // Returns the backend result, or null when client-side validation blocks it.
  const submitLeadQuote = async () => {
    await quoteForm.validateFields(['q_email','q_start']);
    const filledLines = quoteLines.filter(l => (l.description || '').trim());
    if (!filledLines.length) { message.warning('Add at least one line item'); return null; }
    const allVals = quoteForm.getFieldsValue();
    const quoteData = {
      // No `status`: the backend always creates the quote Pending, matching the
      // standard Create Quote screen. Status is workflow-owned, never hand-picked.
      customer_email: allVals.q_email || '',
      billing_address: allVals.q_billing || '',
      start_date: allVals.q_start ? allVals.q_start.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
      last_date: allVals.q_end   ? allVals.q_end.format('YYYY-MM-DD')   : '',
      vat: Number(allVals.q_vat || 0),
      message: allVals.q_message || '',
    };
    return window.electronAPI.crmCreateQuoteForLead(quoteLeadId, quoteData, filledLines);
  };

  // Bookkeeping shared by both create paths (close modal, refresh drawer + list).
  const afterLeadQuoteCreated = async (res) => {
    setQuoteModalOpen(false);
    if (res?.customerId && drawerLead?.id === quoteLeadId) {
      const updated = await window.electronAPI.crmGetLead(quoteLeadId);
      if (updated && !updated.error) setDrawerLead(updated);
    }
    fetchLeadQuotes(quoteLeadId);
    refresh();
  };

  const handleCreateQuote = async () => {
    try {
      const res = await submitLeadQuote();
      if (!res) return;
      if (res.success) {
        message.success(`Quote ${res.quoteNumber} created successfully!`);
        await afterLeadQuoteCreated(res);
      } else { message.error(res?.error || 'Quote creation failed'); }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create quote'); }
  };

  // Create the quote, then hand straight over to the shared email modal so the
  // PDF can be sent without leaving the lead — same flow as Create Quote.
  const handleCreateQuoteAndEmail = async () => {
    try {
      const res = await submitLeadQuote();
      if (!res) return;
      if (!res.success) { message.error(res?.error || 'Quote creation failed'); return; }
      const allVals = quoteForm.getFieldsValue();
      message.success(`Quote ${res.quoteNumber} created successfully!`);
      await afterLeadQuoteCreated(res);
      setEmailTarget({
        id: res.quoteId,
        number: res.quoteNumber,
        email: allVals.q_email || '',
        customerName: drawerLead?.name || '',
        amount: fmtMoney(quoteLines.reduce((s, l) => s + Number(l.amount || 0), 0)),
      });
      setEmailModalOpen(true);
    } catch (e) { if (!e?.errorFields) message.error('Failed to create quote'); }
  };

  // ── Conversion ───────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    const res = await window.electronAPI.crmConvertLead(convertTarget.id, {});
    if (res?.success) {
      message.success('Converted to customer!');
      const target = convertTarget;
      const doQuote = convertThenQuote;
      setConvertTarget(null); setConvertThenQuote(false); refresh();
      if (drawerLead?.id === target.id) {
        const updated = await window.electronAPI.crmGetLead(target.id);
        if (updated && !updated.error) setDrawerLead(updated);
      }
      if (doQuote) { setTimeout(() => openQuoteModal({ ...target, id: target.id }), 400); }
    } else { message.error(res?.error || 'Conversion failed'); }
  };

  // ── Bulk ─────────────────────────────────────────────────────────────────────
  const handleBulkStage = async (stage) => {
    if (!selectedKeys.length) return;
    await window.electronAPI.crmBulkUpdateStage(selectedKeys, stage);
    message.success(`${selectedKeys.length} leads moved to ${stageMap[stage]?.label || stage}`);
    setSelectedKeys([]); refresh();
  };

  // ── Kanban grouping ──────────────────────────────────────────────────────────
  const byStage = useMemo(() => {
    const m = {}; STAGES.forEach(s => { m[s.key] = []; });
    leads.forEach(l => { const k = l.pipeline_stage; if (m[k]) m[k].push(l); else m['new'].push(l); });
    return m;
  }, [leads]);

  // ── Table columns ────────────────────────────────────────────────────────────
  const tableColumns = [
    { title: 'Name',    dataIndex: 'name',    key: 'name',
      render: (v, r) => <a style={{ fontWeight: 600 }} onClick={() => openDrawer(r)}>{v}</a> },
    { title: 'Company', dataIndex: 'company', key: 'company', render: v => v || '—' },
    { title: 'Value',   dataIndex: 'value',   key: 'value',   sorter: (a,b) => a.value - b.value,
      render: v => <span style={{ color:'#1890ff', fontWeight:500 }}>{fmtMoney(v)}</span> },
    { title: 'Stage',    dataIndex: 'pipeline_stage', key: 'stage',
      render: s => { const st = stageMap[s]; return <Tag color={st?.color}>{st?.label || s}</Tag>; } },
    { title: 'Priority', dataIndex: 'priority', key: 'priority',
      render: p => { const pr = prioMap[p]; return <Tag color={pr?.color}>{pr?.label || p}</Tag>; } },
    { title: 'Score', dataIndex: 'score', key: 'score', sorter: (a,b) => a.score - b.score,
      render: s => <Progress percent={s} size="small" style={{ width:80, margin:0 }} showInfo={false}
        strokeColor={s >= 70 ? '#52c41a' : s >= 40 ? '#fa8c16' : '#f5222d'} /> },
    { title: 'Source',    dataIndex: 'source',              key: 'source',    render: v => v || '—' },
    { title: 'Close Date',dataIndex: 'expected_close_date', key: 'close',
      render: d => d ? moment(d).format('MM/DD/YYYY') : '—' },
    { title: 'Customer', key: 'customer', width: 150,
      render: (_, r) => {
        const linkedId = r.customer_id || r.converted_customer_id;
        if (!linkedId) return <span style={{ color:'#bfbfbf' }}>—</span>;
        return (
          <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => goToCustomer(linkedId)}>
            <LinkOutlined /> {r.linked_customer_name || r.customer_name || `#${linkedId}`}
          </Button>
        );
      } },
    { title: '', key: 'actions', width: 190, render: (_, r) => (
      <Space size={2}>
        <Button size="small" type="link" icon={<EditOutlined />}    onClick={() => openEditLead(r)} />
        <Button size="small" type="link"                            onClick={() => openDrawer(r)}>View</Button>
        {!r.converted_customer_id && (
          <Button size="small" type="link" icon={<UserAddOutlined />}
            onClick={() => setConvertTarget(r)}>Convert</Button>
        )}
        <Popconfirm title="Delete this lead?" onConfirm={() => handleDeleteLead(r.id)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 4px' }}>
      {/* Stats Row */}
      {pipelineStats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total Leads',      value: pipelineStats.total,           prefix: <TeamOutlined />,   color: undefined },
            { title: 'Pipeline Value',   value: fmtMoney(pipelineStats.totalValue), color: '#1890ff' },
            { title: 'Won Revenue',      value: fmtMoney(pipelineStats.wonValue),   color: '#52c41a' },
            { title: 'Conversion Rate',  value: `${pipelineStats.conversionRate}%`, prefix: <TrophyOutlined />, color: pipelineStats.conversionRate >= 30 ? '#52c41a' : '#fa8c16' },
          ].map((s, i) => (
            <Col key={i} xs={12} sm={6} style={{ marginBottom: 8 }}>
              <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
                <Statistic title={s.title} value={s.value} prefix={s.prefix} valueStyle={{ fontSize: 16, color: s.color }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {overdueActs.length > 0 && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${overdueActs.length} overdue activit${overdueActs.length > 1 ? 'ies' : 'y'} — click the Activities tab to view`} />
      )}

      <Tabs
        className="gx-tabs-left"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        destroyInactiveTabPane
        animated={false}
        tabBarStyle={{ overflowX: 'auto', flexWrap: 'nowrap' }}
        tabBarExtraContent={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={refresh} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openNewLead}>New Lead</Button>
          </Space>
        }>

        {/* ── Pipeline Kanban ─────────────────────────────────────────────── */}
        <TabPane tab={<span><FunnelPlotOutlined /> Pipeline</span>} key="pipeline">
          <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8, minHeight:400 }}>
            {STAGES.map(stage => (
              <div key={stage.key}
                style={{ minWidth:210, flex:'0 0 210px', background: dragOverStage === stage.key ? '#e6f7ff' : '#f5f5f5',
                  borderRadius:8, padding:8, border:`2px dashed ${dragOverStage === stage.key ? stage.color : 'transparent'}`, transition:'all .2s' }}
                onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={() => handleDrop(stage.key)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <Tag color={stage.color} style={{ margin:0, fontWeight:600 }}>{stage.label}</Tag>
                  <span style={{ fontSize:11, color:'#8c8c8c' }}>
                    {byStage[stage.key]?.length || 0} · {fmtMoney(byStage[stage.key]?.reduce((s,l) => s+(l.value||0),0))}
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(byStage[stage.key] || []).map(lead => (
                    <div key={lead.id} draggable
                      onDragStart={() => setDraggedLead(lead)}
                      onDragEnd={() => { setDraggedLead(null); setDragOverStage(null); }}
                      onClick={() => openDrawer(lead)}
                      style={{ background:'#fff', borderRadius:6, padding:'8px 10px', cursor:'grab',
                        boxShadow:'0 1px 3px rgba(0,0,0,.1)', borderLeft:`3px solid ${prioMap[lead.priority]?.color || '#d9d9d9'}`,
                        userSelect:'none', opacity: draggedLead?.id === lead.id ? 0.5 : 1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{lead.name}</div>
                        <Space size={2}>
                          {lead.converted_customer_id && <Tooltip title="Customer"><Tag color="green" style={{ fontSize:10, padding:'0 4px', margin:0 }}>✓</Tag></Tooltip>}
                          {lead.quote_ids && (() => { try { const q = JSON.parse(lead.quote_ids); return q.length > 0 ? <Tooltip title={`${q.length} quote${q.length>1?'s':''}`}><Badge count={q.length} size="small" style={{ backgroundColor:'#1890ff' }} /></Tooltip> : null; } catch { return null; } })()}
                        </Space>
                      </div>
                      {lead.company && <div style={{ fontSize:11, color:'#8c8c8c' }}>{lead.company}</div>}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                        <span style={{ fontSize:12, color:'#1890ff', fontWeight:500 }}>{fmtMoney(lead.value)}</span>
                        <Tooltip title={`Lead score: ${lead.score || 0}/100`}>
                          <Progress percent={lead.score || 0} size="small" style={{ width:48, margin:0 }} showInfo={false}
                            strokeColor={lead.score >= 70 ? '#52c41a' : lead.score >= 40 ? '#fa8c16' : '#f5222d'} />
                        </Tooltip>
                      </div>
                      {lead.expected_close_date && (
                        <div style={{ fontSize:10, color: moment(lead.expected_close_date) < moment() ? '#f5222d' : '#8c8c8c', marginTop:4 }}>
                          <CalendarOutlined /> {moment(lead.expected_close_date).format('DD/MM/YY')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabPane>

        {/* ── All Leads Table ─────────────────────────────────────────────── */}
        <TabPane tab={`All Leads (${leads.length})`} key="list">
          <div style={{ marginBottom:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <Input.Search placeholder="Name, company, email…" allowClear style={{ width:220 }}
              onSearch={v => setFilters(f => ({ ...f, search: v || undefined }))} />
            <Select placeholder="Stage" allowClear style={{ width:140 }} value={filters.stage}
              onChange={v => setFilters(f => ({ ...f, stage: v }))}>
              {STAGES.map(s => <Option key={s.key} value={s.key}>{s.label}</Option>)}
            </Select>
            <Select placeholder="Priority" allowClear style={{ width:110 }} value={filters.priority}
              onChange={v => setFilters(f => ({ ...f, priority: v }))}>
              {PRIORITIES.map(p => <Option key={p.key} value={p.key}>{p.label}</Option>)}
            </Select>
            <Select placeholder="Source" allowClear style={{ width:140 }} value={filters.source}
              onChange={v => setFilters(f => ({ ...f, source: v }))}>
              {SOURCES.map(s => <Option key={s} value={s}>{s}</Option>)}
            </Select>
            {selectedKeys.length > 0 && (
              <>
                <Divider type="vertical" />
                <span style={{ color:'#666' }}>{selectedKeys.length} selected — Move to:</span>
                <Select placeholder="Stage…" style={{ width:150 }} onChange={handleBulkStage}>
                  {STAGES.map(s => <Option key={s.key} value={s.key}>{s.label}</Option>)}
                </Select>
              </>
            )}
          </div>
          <Table rowKey="id" dataSource={leads} columns={tableColumns} loading={loading} size="small"
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
            pagination={{ defaultPageSize: 25, showSizeChanger:true, showTotal: t => `${t} leads` }} />
        </TabPane>

        {/* ── Activities ─────────────────────────────────────────────────── */}
        <TabPane
          tab={<span><CalendarOutlined /> Activities {overdueActs.length > 0 && <Badge count={overdueActs.length} size="small" style={{ marginLeft:4 }} />}</span>}
          key="activities">
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span style={{ color:'#f5222d' }}><WarningOutlined /> Overdue ({overdueActs.length})</span>} style={{ marginBottom:16 }}>
                {overdueActs.length === 0
                  ? <Empty description="No overdue activities" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : <Timeline>{overdueActs.map(a => (
                      <Timeline.Item key={a.id} color="red" dot={<span>{ACT_ICONS[a.type]}</span>}>
                        <div style={{ fontWeight:600 }}>{a.subject}</div>
                        <div style={{ fontSize:12, color:'#595959' }}>{a.lead_name}{a.lead_company ? ` · ${a.lead_company}` : ''}</div>
                        <div style={{ fontSize:11, color:'#f5222d' }}>Due: {moment(a.dueDate).format('MM/DD/YYYY HH:mm')}</div>
                      </Timeline.Item>
                    ))}</Timeline>}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span style={{ color:'#1890ff' }}><ClockCircleOutlined /> Next 7 Days ({upcomingActs.length})</span>} style={{ marginBottom:16 }}>
                {upcomingActs.length === 0
                  ? <Empty description="Nothing due soon" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : <Timeline>{upcomingActs.map(a => (
                      <Timeline.Item key={a.id} color="blue" dot={<span>{ACT_ICONS[a.type]}</span>}>
                        <div style={{ fontWeight:600 }}>{a.subject}</div>
                        <div style={{ fontSize:12, color:'#595959' }}>{a.lead_name}{a.lead_company ? ` · ${a.lead_company}` : ''}</div>
                        <div style={{ fontSize:11, color:'#1890ff' }}>Due: {moment(a.dueDate).format('MM/DD/YYYY HH:mm')}</div>
                      </Timeline.Item>
                    ))}</Timeline>}
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ── Reports ────────────────────────────────────────────────────── */}
        <TabPane tab={<span><BarChartOutlined /> Reports</span>} key="reports">
          {!reports ? <Card><Empty description="No data yet" /></Card> : (
            <Row gutter={16}>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Pipeline by Stage" size="small">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reports.byStage.map(s => ({ ...s, label: stageMap[s.stage]?.label || s.stage }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize:11 }} />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="count" name="Leads" fill="#1890ff">
                        {reports.byStage.map((s, i) => <Cell key={i} fill={stageMap[s.stage]?.color || '#1890ff'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Leads by Source" size="small">
                  {reports.bySource.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={reports.bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80}
                          label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}>
                          {reports.bySource.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <RTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Monthly: Created vs Won" size="small">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={[...reports.monthly].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize:11 }} />
                      <YAxis />
                      <RTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="created" stroke="#1890ff" name="Created" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="won"     stroke="#52c41a" name="Won"     strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Activity Breakdown" size="small">
                  {reports.actTypes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={reports.actTypes} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="type" type="category" tick={{ fontSize:12 }} width={70} />
                        <RTooltip />
                        <Bar dataKey="count" fill="#722ed1" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} style={{ marginBottom:16 }}>
                <Card title="Top Performers" size="small"
                  extra={<span style={{ fontSize:12, color:'#8c8c8c' }}>Avg days to close: <strong>{reports.avgDaysToClose}</strong></span>}>
                  <Table size="small" pagination={false} rowKey="owner" dataSource={reports.topOwners}
                    columns={[
                      { title:'Owner',       dataIndex:'owner', key:'owner' },
                      { title:'Total Leads', dataIndex:'leads', key:'leads' },
                      { title:'Won',         dataIndex:'won',   key:'won' },
                      { title:'Win Rate', key:'rate',
                        render: r => <span style={{ color:'#52c41a', fontWeight:600 }}>
                          {r.leads > 0 ? Math.round((r.won / r.leads) * 100) : 0}%</span> },
                    ]} />
                </Card>
              </Col>
            </Row>
          )}
        </TabPane>
      </Tabs>

      {/* ── Lead Drawer ──────────────────────────────────────────────────────── */}
      <Drawer
        className="app-detail-drawer"
        title={drawerLead ? (
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:8, width:'100%' }}>
            <span style={{ fontWeight:600, flex:'1 1 200px', minWidth:0, overflowWrap:'anywhere' }}>{drawerLead.name}</span>
            <Space wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditLead(drawerLead)}>Edit</Button>
              {(drawerLead.customer_id || drawerLead.converted_customer_id) && (
                <Button size="small" icon={<UserOutlined />}
                  onClick={() => goToCustomer(drawerLead.customer_id || drawerLead.converted_customer_id)}>View Customer</Button>
              )}
              {!drawerLead.converted_customer_id
                ? <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={() => setConvertTarget(drawerLead)}>Convert</Button>
                : <Tag color="green"><CheckCircleOutlined /> Customer #{drawerLead.converted_customer_id}</Tag>}
            </Space>
          </div>
        ) : ''}
        width={680} visible={!!drawerLead} onClose={() => setDrawerLead(null)} destroyOnClose>
        {drawerLead && (
          <Tabs
            key={drawerLead.id}
            activeKey={drawerTab}
            onChange={(key) => setDrawerTab(key)}
            destroyInactiveTabPane
            animated={false}>
            <TabPane tab="Details" key="info">
              <Row gutter={[8, 10]}>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Stage</div>
                  <Tag color={stageMap[drawerLead.pipeline_stage]?.color}>{stageMap[drawerLead.pipeline_stage]?.label}</Tag>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Priority</div>
                  <Tag color={prioMap[drawerLead.priority]?.color}>{prioMap[drawerLead.priority]?.label}</Tag>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Lead Score</div>
                  <Progress percent={drawerLead.score || 0} size="small"
                    strokeColor={drawerLead.score >= 70 ? '#52c41a' : '#fa8c16'} />
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Deal Value</div>
                  <div style={{ color:'#1890ff', fontWeight:600 }}>{fmtMoney(drawerLead.value)}</div>
                </Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Source</div><div>{drawerLead.source || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Expected Close</div>
                  <div>{drawerLead.expected_close_date ? moment(drawerLead.expected_close_date).format('MM/DD/YYYY') : '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><MailOutlined /> Email</div><div>{drawerLead.email || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><PhoneOutlined /> Phone</div><div>{drawerLead.phone || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Company</div><div>{drawerLead.company || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><GlobalOutlined /> Website</div><div>{drawerLead.website || '—'}</div></Col>
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}><EnvironmentOutlined /> Address</div><div>{drawerLead.address || '—'}</div></Col>
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Assigned To</div><div>{drawerLead.assigned_to || '—'}</div></Col>
                {drawerLead.tags && (() => { try { const t = JSON.parse(drawerLead.tags); return t.length > 0 ? (
                  <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Tags</div>{t.map(tag => <Tag key={tag}>{tag}</Tag>)}</Col>
                ) : null; } catch { return null; } })()}
                {(drawerLead.customer_id || drawerLead.converted_customer_id) && (() => {
                  const linkedId  = drawerLead.customer_id || drawerLead.converted_customer_id;
                  const converted = !!drawerLead.converted_customer_id;
                  const linkedName = drawerLead.linked_customer_name
                    || (converted ? drawerLead.customer_name : null)
                    || `Customer #${linkedId}`;
                  return (
                    <Col span={24}>
                      <div style={{ fontSize:11, color:'#8c8c8c' }}>{converted ? 'Converted Customer' : 'Linked Customer'}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <Tag color={converted ? 'green' : 'blue'} style={{ margin:0 }}>
                          {converted ? <CheckCircleOutlined /> : <LinkOutlined />} {linkedName}
                        </Tag>
                        <Button size="small" type="link" style={{ padding:0 }}
                          onClick={() => goToCustomer(linkedId)}>View Customer</Button>
                        {converted && drawerLead.converted_at && (
                          <span style={{ fontSize:11, color:'#8c8c8c' }}>
                            Converted {moment(drawerLead.converted_at).format('MM/DD/YYYY')}
                          </span>
                        )}
                      </div>
                    </Col>
                  );
                })()}
                {drawerLead.lost_reason && <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Lost Reason</div><div style={{ color:'#f5222d' }}>{drawerLead.lost_reason}</div></Col>}
                {drawerLead.notes && (
                  <Col span={24}>
                    <Divider style={{ margin:'8px 0' }} />
                    <div style={{ fontSize:11, color:'#8c8c8c' }}>Notes</div>
                    <div style={{ whiteSpace:'pre-line', background:'#fffbe6', padding:8, borderRadius:4 }}>{drawerLead.notes}</div>
                  </Col>
                )}
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c', marginTop:4 }}>Created {moment(drawerLead.createdAt).format('MM/DD/YYYY HH:mm')}</div></Col>
              </Row>
              <Divider />
              <Space direction="vertical" style={{ width:'100%' }}>
                <Button block type="primary" icon={<PlusOutlined />} onClick={() => openQuoteModal(drawerLead)}>Create / Send Quotation</Button>
                <Button block type="dashed" icon={<PlusOutlined />} onClick={() => openNewActivity(drawerLead.id)}>Log Activity</Button>
              </Space>
            </TabPane>

            <TabPane tab={`Quotes (${leadQuotes.length})`} key="quotes">
              <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, color:'#8c8c8c' }}>Quotes linked to this lead</span>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openQuoteModal(drawerLead)}>Create Quote</Button>
              </div>
              {leadQuotes.length === 0
                ? <Empty description="No quotes yet — click 'Create Quote' to send a quotation" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {leadQuotes.map(q => {
                      // Canonical quote workflow states (backend/services/documentStatus.js).
                      const statusColors = { Pending:'#faad14', Accepted:'#52c41a', Declined:'#f5222d', Converted:'#722ed1' };
                      const subtotal = Number(q.amount || 0);
                      const vatAmt   = subtotal * (Number(q.vat || 0) / 100);
                      const total    = subtotal + vatAmt;
                      return (
                        <Card key={q.id} size="small" style={{ borderLeft:`3px solid ${statusColors[normalizeStatus(q.status)] || '#d9d9d9'}` }}
                          extra={<QuoteStatusBadge status={q.status} />}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div>
                              <div style={{ fontWeight:600 }}>{q.number}</div>
                              <div style={{ fontSize:11, color:'#8c8c8c' }}>{q.start_date && moment(q.start_date).format('MM/DD/YYYY')}{q.last_date ? ` → ${moment(q.last_date).format('MM/DD/YYYY')}` : ''}</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ color:'#1890ff', fontWeight:600 }}>{fmtMoney(total)}</div>
                              {q.vat > 0 && <div style={{ fontSize:11, color:'#8c8c8c' }}>incl. {q.vat}% Tax</div>}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>}
            </TabPane>

            <TabPane tab={`Activities (${drawerActs.length})`} key="activities">
              <Button type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom:12 }}
                onClick={() => openNewActivity(drawerLead.id)}>Log Activity</Button>
              {drawerActs.length === 0
                ? <Empty description="No activities yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <Timeline loading={drawerLoading}>
                    {drawerActs.map(a => (
                      <Timeline.Item key={a.id}
                        color={a.status === 'done' ? 'green' : a.dueDate && moment(a.dueDate) < moment() ? 'red' : 'blue'}
                        dot={<span style={{ fontSize:15 }}>{ACT_ICONS[a.type] || '📌'}</span>}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div>
                            <div style={{ fontWeight:600, textDecoration: a.status === 'done' ? 'line-through' : 'none' }}>{a.subject}</div>
                            {a.details  && <div style={{ fontSize:12, color:'#595959', marginTop:2 }}>{a.details}</div>}
                            {a.outcome  && <div style={{ fontSize:12, color:'#52c41a', marginTop:2 }}>Outcome: {a.outcome}</div>}
                            <div style={{ fontSize:11, color:'#8c8c8c', marginTop:2 }}>
                              {a.dueDate && <>{moment(a.dueDate).format('MM/DD/YYYY HH:mm')} · </>}
                              {a.status === 'done'
                                ? <span style={{ color:'#52c41a' }}>✓ Done</span>
                                : <span style={{ color:'#fa8c16' }}>Open</span>}
                            </div>
                          </div>
                          <Space size={2}>
                            {a.status !== 'done' && <Button size="small" type="link" icon={<CheckCircleOutlined />} onClick={() => completeActivity(a)} />}
                            <Button size="small" type="link" icon={<EditOutlined />}
                              onClick={() => { setEditingAct(a); actForm.setFieldsValue({ ...a, dueDate: a.dueDate ? moment(a.dueDate) : null }); setActModalOpen(true); }} />
                            <Popconfirm title="Delete?" onConfirm={async () => { await window.electronAPI.crmDeleteActivity(a.id); fetchDrawerActs(drawerLead.id); }}>
                              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        </div>
                      </Timeline.Item>
                    ))}
                  </Timeline>}
            </TabPane>
          </Tabs>
        )}
      </Drawer>

      {/* ── Lead Form Modal ─────────────────────────────────────────────────── */}
      <Modal title={editingLead ? 'Edit Lead' : 'New Lead'} visible={leadModalOpen} zIndex={Z.MODAL}
        onCancel={() => setLeadModalOpen(false)} onOk={handleSaveLead}
        width={920} okText="Save" style={{ top: 24 }}
        bodyStyle={{ maxHeight: 'calc(100vh - 190px)', overflowY: 'auto', paddingRight: 12 }}>
        <Form form={leadForm} layout="vertical">
          {/* ── Section 1: Source ─────────────────────────────────────────── */}
          <Divider orientation="left" plain style={{ marginTop: 0 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Source</span>
          </Divider>
          <div style={{ marginBottom: 16 }}>
            {/* Both creation modes on one line (wraps only on very small screens). */}
            <Radio.Group
              value={createMode}
              onChange={(e) => handleModeChange(e.target.value)}
              style={{ display: 'flex', flexWrap: 'wrap', columnGap: 24, rowGap: 8 }}
            >
              <Radio value={MODE_EXISTING}><span><LinkOutlined /> Existing Customer</span></Radio>
              <Radio value={MODE_SCRATCH}><span><UserAddOutlined /> New / From Scratch</span></Radio>
            </Radio.Group>
          </div>

          {/* ── Section 2: Customer / Contact Information ─────────────────── */}
          <Divider orientation="left" plain style={{ marginTop: 0 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Customer-Contact Information</span>
          </Divider>

          {createMode === MODE_EXISTING ? (
            <>
              <Form.Item name="customer_id" label="Customer"
                rules={[{ required: true, message: 'Select a customer' }]}
                extra="Linked by customer id — not by name or email. Contact details below are copied onto the lead and editing them here does not change the customer record.">
                <Select
                  showSearch allowClear
                  placeholder="Search by name, display name, company, email, phone or customer #"
                  filterOption={false}
                  onSearch={searchCustomers}
                  onChange={handleSelectCustomer}
                  suffixIcon={<SearchOutlined />}
                  notFoundContent={customerSearching ? <Spin size="small" /> : 'No customers found'}>
                  {customerOptions.map(c => (
                    <Option key={c.id} value={c.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span>
                          {c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || `Customer #${c.id}`}
                        </span>
                        <span style={{ color: '#8c8c8c', fontSize: 11 }}>
                          {c.company_name ? `${c.company_name} · ` : ''}{c.email || ''} · #{c.id}
                        </span>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              {selectedCustomerId && (
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Tag color="blue" style={{ margin: 0 }}>
                    <LinkOutlined /> Linked to {selectedCustomerName}
                  </Tag>
                  <Button size="small" icon={<UserOutlined />} onClick={() => goToCustomer(selectedCustomerId)}>
                    View Customer
                  </Button>
                </div>
              )}
              <CustomerContactFields form={leadForm} sections={false} showNotes={false} gridColumns="1fr 1fr 1fr" />
              <Row gutter={12}>
                <Col span={8}><Form.Item name="website" label="Website"><Input /></Form.Item></Col>
              </Row>
            </>
          ) : (
            <>
              {duplicateWarning && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message="A customer with this email already exists"
                  description={
                    <span>
                      <strong>{duplicateWarning.name}</strong> (Customer #{duplicateWarning.id}) —{' '}
                      <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}
                        onClick={() => linkDuplicateCustomer(duplicateWarning.id)}>link to that customer instead</Button>
                    </span>
                  } />
              )}
              <CustomerContactFields form={leadForm} sections={false} showNotes={false} gridColumns="1fr 1fr 1fr"
                onEmailChange={checkDuplicateCustomer} />
              <Row gutter={12}>
                <Col span={8}><Form.Item name="website" label="Website"><Input /></Form.Item></Col>
              </Row>
            </>
          )}

          {/* ── Section 3: Lead Details ───────────────────────────────────── */}
          <Divider orientation="left" plain>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Lead Details</span>
          </Divider>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="pipeline_stage" label="Pipeline Stage" initialValue="new">
                <Select>{STAGES.map(s => <Option key={s.key} value={s.key}><Tag color={s.color} style={{ marginRight:4 }}>{s.label}</Tag></Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Priority" initialValue="medium">
                <Select>{PRIORITIES.map(p => <Option key={p.key} value={p.key}><Tag color={p.color}>{p.label}</Tag></Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="value" label="Deal Value" initialValue={0}>
                <InputNumber min={0} style={{ width:'100%' }}
                  formatter={v => `${cSym} ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={v => v.replace(new RegExp(`${cSym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?|(,*)`, 'g'), '')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="source" label="Lead Source">
                <Select allowClear>{SOURCES.map(s => <Option key={s} value={s}>{s}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="assigned_to" label="Assigned To">
                <Select allowClear showSearch optionFilterProp="children" placeholder="Select employee"
                  dropdownRender={menu => (
                    <>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setEmpModalOpen(true)} block>Add New Employee</Button></>
                  )}>
                  {employees.map(e => <Option key={e.id} value={`${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email || `Employee #${e.id}`}>{`${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email || `Employee #${e.id}`}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="expected_close_date" label="Expected Close Date">
                <DatePicker style={{ width:'100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            {(editingLead?.pipeline_stage === 'lost') && (
              <Col span={24}><Form.Item name="lost_reason" label="Lost Reason"><Input /></Form.Item></Col>
            )}
          </Row>

          {/* ── Section 4: Tags & Notes ───────────────────────────────────── */}
          <Divider orientation="left" plain>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Tags &amp; Notes</span>
          </Divider>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="tags" label="Tags">
                <Select mode="tags" placeholder="Type and press Enter to add tags…" style={{ width:'100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}><Form.Item name="notes" label="Notes"><TextArea rows={3} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Activity Modal ─────────────────────────────────────────────────── */}
      <Modal title={editingAct ? 'Edit Activity' : 'Log Activity'} visible={actModalOpen} zIndex={Z.MODAL}
        onCancel={() => setActModalOpen(false)} onOk={handleSaveActivity} okText="Save">
        <Form form={actForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="type" label="Type" initialValue="call" rules={[{ required:true }]}>
                <Select>
                  {ACT_TYPES.map(t => <Option key={t} value={t}>{ACT_ICONS[t] || ''} {t.charAt(0).toUpperCase() + t.slice(1)}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Status" initialValue="open">
                <Select>
                  <Option value="open">Open</Option>
                  <Option value="done">Done</Option>
                  <Option value="canceled">Canceled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="subject" label="Subject" rules={[{ required:true }]}><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="dueDate" label="Due Date / Time">
                <DatePicker showTime style={{ width:'100%' }} format="MM/DD/YYYY HH:mm" />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="details" label="Notes / Details"><TextArea rows={3} /></Form.Item></Col>
            <Col span={12}><Form.Item name="outcome" label="Outcome"><Input placeholder="Result of this activity…" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Convert Confirmation ────────────────────────────────────────────── */}
      <Modal title="Convert Lead to Customer" visible={!!convertTarget} zIndex={Z.MODAL}
        onCancel={() => { setConvertTarget(null); setConvertThenQuote(false); }}
        onOk={handleConvert} okText="Convert" okType="primary">
        {convertTarget && (
          <div>
            <p>Create a <strong>Customer</strong> record from:</p>
            <p style={{ fontSize:15 }}><strong>{convertTarget.name}</strong>{convertTarget.company ? ` — ${convertTarget.company}` : ''}</p>
            <p style={{ color:'#8c8c8c', fontSize:12 }}>The lead will be marked as <Tag color="green">Won</Tag> and linked to the new customer profile.</p>
            <Divider style={{ margin:'12px 0' }} />
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={convertThenQuote} onChange={e => setConvertThenQuote(e.target.checked)} />
              <span>Create a quotation immediately after conversion</span>
            </label>
          </div>
        )}
      </Modal>

      {/* ── Lead Quote Creation Modal ─────────────────────────────────────────── */}
      <Modal title="Create Quotation for Lead" visible={quoteModalOpen} zIndex={Z.MODAL}
        onCancel={() => setQuoteModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setQuoteModalOpen(false)}>Cancel</Button>,
          <Button key="email" icon={<MailOutlined />} onClick={handleCreateQuoteAndEmail}>Create &amp; Email</Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreateQuote}>Create Quote</Button>,
        ]}
        width={780} style={{ top:20 }}>
        <Form form={quoteForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}>
              <Form.Item label="Status">
                <Space>
                  <QuoteStatusBadge status="Pending" />
                  <span style={{ color:'#8c8c8c', fontSize:12 }}>Controlled by workflow actions</span>
                </Space>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_start" label="Quote Date" rules={[{ required:true }]}>
                <DatePicker style={{ width:'100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_end" label="Expiry Date">
                <DatePicker style={{ width:'100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="q_email" label="Customer Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="q_vat" label="Tax Rate (%)" initialValue={0}>
                <Select allowClear placeholder="Select Tax rate"
                  onChange={(v) => setLeadQuoteVatPercent(Number(v) || 0)}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '4px 0' }} />
                      <Button type="link" icon={<PlusOutlined />} onMouseDown={e => e.preventDefault()}
                        onClick={() => setVatModalOpen(true)} style={{ width:'100%', textAlign:'left' }}>
                        Add New Tax Rate
                      </Button>
                    </>
                  )}>
                  <Option value={0}>No Tax (0%)</Option>
                  {vatRates.map(v => (
                    <Option key={v.id} value={v.vat_percentage}>{v.vat_name} ({v.vat_percentage}%)</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="q_billing" label="Billing Address">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="q_message" label="Message / Notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          {/* Line items */}
          <Divider style={{ margin:'8px 0' }}>Line Items</Divider>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#fafafa' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', borderBottom:'1px solid #f0f0f0', width:180 }}>Product</th>
                  <th style={{ padding:'6px 8px', textAlign:'left', borderBottom:'1px solid #f0f0f0' }}>Description</th>
                  <th style={{ padding:'6px 8px', width:70, borderBottom:'1px solid #f0f0f0' }}>Qty</th>
                  <th style={{ padding:'6px 8px', width:100, borderBottom:'1px solid #f0f0f0' }}>Rate (R)</th>
                  <th style={{ padding:'6px 8px', width:110, borderBottom:'1px solid #f0f0f0' }}>Amount (R)</th>
                  <th style={{ padding:'6px 4px', width:36, borderBottom:'1px solid #f0f0f0' }}></th>
                </tr>
              </thead>
              <tbody>
                {quoteLines.map((line, idx) => (
                  <tr key={idx}>
                    <td style={{ padding:'4px 4px' }}>
                      <Select size="small" placeholder="Select product" allowClear style={{ width:'100%' }}
                        value={line.product_id != null ? Number(line.product_id) : undefined}
                        onChange={v => selectProduct(idx, v)}
                        showSearch optionFilterProp="children">
                        {products.map(p => <Option key={p.id} value={Number(p.id)}>{p.name || p.description}</Option>)}
                      </Select>
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <Input size="small" value={line.description} placeholder="Description"
                        onChange={e => updateLine(idx,'description',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <InputNumber size="small" min={0} style={{ width:'100%' }} value={line.quantity}
                        onChange={v => updateLine(idx,'quantity',v)} />
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <InputNumber size="small" min={0} style={{ width:'100%' }} value={line.rate}
                        onChange={v => updateLine(idx,'rate',v)} />
                    </td>
                    <td style={{ padding:'4px 8px', fontWeight:500, color:'#1890ff' }}>
                      {fmtMoney(line.amount)}
                    </td>
                    <td style={{ padding:'4px 4px', textAlign:'center' }}>
                      <Button size="small" type="link" danger icon={<DeleteOutlined />}
                        onClick={() => setQuoteLines(prev => {
                          const next = prev.filter((_, i) => i !== idx);
                          if (next.length === 0) return [makeEmptyQuoteLine()];
                          return ensureTrailingEmptyLine(next, makeEmptyQuoteLine);
                        })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="dashed" size="small" icon={<PlusOutlined />} style={{ marginTop:8, width:'100%' }}
            onClick={() => setQuoteLines(prev => [...prev, { description:'', quantity:1, rate:0, amount:0, product_id: null }])}>
            Add Line
          </Button>

          {/* Totals */}
          {(() => {
            const vatRate  = Number(leadQuoteVatPercent) || 0;
            const subtotal = quoteLines.reduce((s,l) => s + Number(l.amount||0), 0);
            const vatAmt   = subtotal * (vatRate / 100);
            const total    = subtotal + vatAmt;
            return (
              <div style={{ marginTop:12, padding:'10px 16px', background:'#fafafa', borderRadius:6, textAlign:'right' }}>
                <div style={{ marginBottom:4 }}>Subtotal: <strong>{fmtMoney(subtotal)}</strong></div>
                {vatRate > 0 && <div style={{ marginBottom:4, color:'#8c8c8c' }}>Tax ({vatRate}%): <strong>{fmtMoney(vatAmt)}</strong></div>}
                <div style={{ fontSize:16, color:'#1890ff' }}>Total: <strong>{fmtMoney(total)}</strong></div>
              </div>
            );
          })()}
        </Form>
      </Modal>

      {/* ── Add New Tax Rate (linked from the lead quote tax dropdown) ───────── */}
      <Modal title="Add New Tax Rate" visible={vatModalOpen} zIndex={Z.NESTED_MODAL}
        onOk={handleAddVat} onCancel={() => setVatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={vatForm} layout="vertical" preserve={false}>
          <Form.Item name="vat_name" label="Tax Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Standard Rate" />
          </Form.Item>
          <Form.Item name="vat_percentage" label="Percentage (%)" rules={[{ required: true }]}>
            <InputNumber style={{ width:'100%' }} min={0} max={100} step={0.5} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Email the quote that was just created from this lead ─────────────── */}
      <SendEmailModal
        visible={emailModalOpen}
        onClose={() => { setEmailModalOpen(false); setEmailTarget(null); }}
        recipientEmail={emailTarget?.email || ''}
        documentType="Quote"
        documentNumber={emailTarget?.number || ''}
        amount={emailTarget?.amount || ''}
        customerName={emailTarget?.customerName || ''}
        documentId={emailTarget?.id || null}
      />

      {/* ── Add Employee Modal ──────────────────────────────────────────────── */}
      <Modal title="Add New Employee" visible={empModalOpen} zIndex={Z.NESTED_MODAL}
        onCancel={() => setEmpModalOpen(false)} onOk={handleAddEmployee} okText="Add Employee">
        <Form form={empForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="department" label="Department"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="position" label="Position"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default Leads;


