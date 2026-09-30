import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, message, Tag, Row, Col, Tooltip, Popconfirm, Drawer, Divider, Avatar, Typography, Switch, Descriptions, Tabs, Statistic, Empty, Spin, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, PrinterOutlined, AppstoreOutlined, DollarOutlined, FileTextOutlined, BoxPlotOutlined, ShoppingOutlined, EyeOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import moment from 'moment';
import AccountSelect from './AccountSelect';
import FormSection, { FORM_ITEM_STYLE } from './FormSection';
import { typeOptions, normalizeTypeCode, itemTypeLabel, capabilities, getSections } from '../../utils/itemTypes';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

// Canonical account-type filters for each Item accounting relationship. These
// are the REAL Chart-of-Accounts classifications — never account names.
const INCOME_ACCOUNT_TYPES = ['Income', 'Other Income'];
const EXPENSE_ACCOUNT_TYPES = ['Expense', 'Other Expense', 'Cost of Goods Sold'];
const COGS_ACCOUNT_TYPES = ['Cost of Goods Sold', 'Expense', 'Other Expense'];
const INVENTORY_ASSET_ACCOUNT_TYPES = ['Asset', 'Bank', 'Cash', 'Fixed Asset', 'Other Current Asset', 'Other Asset', 'Inventory'];

const TYPE_COLORS = {
  INVENTORY_PART: '#1890ff',
  NON_INVENTORY_PART: '#13c2c2',
  SERVICE: '#722ed1',
};

const VALUATION_METHODS = [
  { value: 'FIFO', label: 'FIFO (First In, First Out)' },
  { value: 'WEIGHTED_AVERAGE', label: 'Weighted Average' },
  { value: 'STANDARD_COST', label: 'Standard Cost' },
];

const PO_STATUS_LABEL = {
  DRAFT: 'Draft', OPEN: 'Open', PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received', PARTIALLY_BILLED: 'Partially Billed', BILLED: 'Billed',
  CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

// The REAL on-hand quantity, sourced from the inventory engine's single source
// of truth (`item_stock`) and delivered by the backend as `inventory_stock`.
const stockOf = (r) => {
  if (!r) return 0;
  if (r.inventory_stock != null) return Number(r.inventory_stock) || 0;
  return Number(r.stock ?? r.quantity ?? 0) || 0;
};

const UnifiedItemList = () => {
  const { symbol: cSym } = useCurrency();
  const routerHistory = useHistory();
  const fmtMoney = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const [form] = Form.useForm();
  const [itemType, setItemType] = useState('INVENTORY_PART');

  // Read-only detail view (all master fields + stock, movements, transactions)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);

  // Product / Inventory History (running balance)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyFilters, setHistoryFilters] = useState({ from: null, to: null, type: null });
  const [adjDetail, setAdjDetail] = useState(null);

  // On-PO drill-down (active PO lines contributing to an item's On-PO qty)
  const [onPoModal, setOnPoModal] = useState({ open: false, item: null, loading: false, lines: [] });

  // Lookups
  const [accounts, setAccounts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [vatRates, setVatRates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Inline "add new" modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm] = Form.useForm();
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subForm] = Form.useForm();
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitForm] = Form.useForm();

  // Visible sections come from the canonical capability model — never hardcoded
  // per-type checks in the form body.
  const sections = useMemo(() => getSections(itemType), [itemType]);
  const showSection = (name) => sections.includes(name);

  const fetchItems = useCallback(async (page = pagination.current, size = pagination.pageSize, term = search, type = typeFilter, cat = categoryFilter, status = statusFilter) => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getProductsPaginated?.(page, size, term || '', type === 'all' ? '' : type, cat === 'all' ? '' : cat, status === 'all' ? '' : status);
      if (data && Array.isArray(data.data)) {
        setItems(data.data);
        setPagination(p => ({ ...p, current: page, total: data.total || data.data.length }));
      } else {
        const all = await window.electronAPI.getAllProducts?.();
        const list = Array.isArray(all) ? all : (all?.all || all?.data || []);
        setItems(list);
        setPagination(p => ({ ...p, current: page, total: list.length }));
      }
    } catch (error) {
      message.error('Failed to load items');
      setItems([]);
    }
    setLoading(false);
  }, [pagination.current, pagination.pageSize, search, typeFilter, categoryFilter, statusFilter]);

  const loadLookups = useCallback(async () => {
    try {
      const [accs, vends, vats, cats, unitsList, whs] = await Promise.all([
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
        window.electronAPI.getAllSuppliers?.().catch(() => []),
        window.electronAPI.getAllVat?.().catch(() => []),
        window.electronAPI.getProductCategories?.().catch(() => []),
        window.electronAPI.getUnitsOfMeasure?.().catch(() => []),
        window.electronAPI.getWarehouses?.().catch(() => []),
      ]);
      setAccounts(Array.isArray(accs) ? accs : (accs?.data || []));
      setVendors(Array.isArray(vends) ? vends : (vends?.all || vends?.data || []));
      setVatRates(Array.isArray(vats) ? vats : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setUnits(Array.isArray(unitsList) ? unitsList : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
    } catch (e) {
      console.error('Failed to load item lookups:', e);
    }
  }, []);

  const loadSubcategories = useCallback(async (category) => {
    try {
      const subs = await window.electronAPI.getItemSubcategories?.(category || '');
      setSubcategories(Array.isArray(subs) ? subs : []);
    } catch { setSubcategories([]); }
  }, []);

  useEffect(() => { fetchItems(); loadLookups(); loadSubcategories(''); }, [fetchItems, loadLookups, loadSubcategories]);

  const uniqueCategories = useMemo(() => {
    const set = new Set(categories.map(c => c.name));
    items.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set).filter(Boolean).sort();
  }, [categories, items]);

  const typeCounts = useMemo(() => {
    const counts = { INVENTORY_PART: 0, NON_INVENTORY_PART: 0, SERVICE: 0 };
    items.forEach(i => {
      const code = normalizeTypeCode(i.type);
      if (code) counts[code] += 1;
    });
    return counts;
  }, [items]);

  const totalValue = items.reduce((s, r) => s + (Number(r.price || 0) * stockOf(r)), 0);
  const lowStockCount = items.filter(i => normalizeTypeCode(i.type) === 'INVENTORY_PART' && stockOf(i) < 10).length;

  const openAdd = () => {
    setEditingItem(null);
    form.resetFields();
    setItemType('INVENTORY_PART');
    form.setFieldsValue({ type: 'INVENTORY_PART', isActive: true, valuationMethod: 'FIFO', purchaseCost: 0, salesPrice: 0, reorderPoint: 0, preferredStockLevel: 0 });
    setDrawerOpen(true);
  };

  const openEdit = async (record) => {
    try {
      const full = (await window.electronAPI.getItemMaster?.(record.id)) || record;
      setEditingItem(full);
      const code = normalizeTypeCode(full.type) || 'NON_INVENTORY_PART';
      setItemType(code);
      form.setFieldsValue({
        type: code,
        name: full.name || '',
        sku: full.sku || '',
        isActive: full.is_active == null ? true : !!Number(full.is_active),
        description: full.description || '',
        category: full.category || undefined,
        subcategory: full.subcategory || undefined,
        unitOfMeasure: full.unit_of_measure || undefined,
        purchaseCost: full.purchase_cost != null ? Number(full.purchase_cost) : 0,
        purchaseDescription: full.purchase_description || '',
        preferredVendorId: full.preferred_vendor_id != null ? Number(full.preferred_vendor_id) : undefined,
        purchaseExpenseAccountId: full.purchase_expense_account_id != null ? Number(full.purchase_expense_account_id) : undefined,
        purchaseTaxRateId: full.purchase_tax_rate_id != null ? Number(full.purchase_tax_rate_id) : undefined,
        defaultPurchaseUnit: full.default_purchase_unit || undefined,
        vendorItemNumber: full.vendor_item_number || '',
        salesPrice: full.price != null ? Number(full.price) : 0,
        salesDescription: full.sales_description || '',
        incomeAccountId: full.income_account_id != null ? Number(full.income_account_id) : undefined,
        salesTaxRateId: full.sales_tax_rate_id != null ? Number(full.sales_tax_rate_id) : undefined,
        defaultSalesUnit: full.default_sales_unit || undefined,
        inventoryAssetAccountId: full.inventory_asset_account_id != null ? Number(full.inventory_asset_account_id) : undefined,
        cogsAccountId: full.cogs_account_id != null ? Number(full.cogs_account_id) : undefined,
        reorderPoint: full.reorder_point != null ? Number(full.reorder_point) : 0,
        preferredStockLevel: full.preferred_stock_level != null ? Number(full.preferred_stock_level) : 0,
        valuationMethod: full.valuation_method || 'FIFO',
        defaultWarehouseId: full.default_warehouse_id != null ? Number(full.default_warehouse_id) : undefined,
      });
      if (full.category) loadSubcategories(full.category);
      setDrawerOpen(true);
    } catch { message.error('Failed to load item'); }
  };

  const accountLabel = (id) => {
    if (id == null) return '—';
    const a = accounts.find(x => Number(x.id) === Number(id));
    return a ? (a.accountName || a.name || `#${id}`) : `#${id}`;
  };
  const vendorLabel = (id) => {
    if (id == null) return '—';
    const v = vendors.find(x => Number(x.id) === Number(id));
    return v ? (v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || v.company_name || `#${id}`) : `#${id}`;
  };
  const taxLabel = (id) => {
    if (id == null) return '—';
    const v = vatRates.find(x => Number(x.id) === Number(id));
    return v ? `${v.vat_name}${v.vat_percentage != null ? ` (${v.vat_percentage}%)` : ''}` : `#${id}`;
  };

  const openView = async (record) => {
    setViewDetail(null);
    setViewOpen(true);
    setViewLoading(true);
    try {
      const d = await window.electronAPI.getItemDetail?.(record.id);
      setViewDetail(d && !d.error ? d : { master: record, stock: [], movements: [], purchases: [], sales: [], summary: {} });
    } catch {
      setViewDetail({ master: record, stock: [], movements: [], purchases: [], sales: [], summary: {} });
    }
    setViewLoading(false);
  };

  const loadHistory = useCallback(async (itemId, filters) => {
    setHistoryLoading(true);
    try {
      const f = filters || historyFilters;
      const res = await window.electronAPI.getItemHistory?.(itemId, {
        from: f.from ? f.from.format('YYYY-MM-DD') : null,
        to: f.to ? f.to.format('YYYY-MM-DD') : null,
        type: f.type || null,
      });
      setHistoryData(res && !res.error ? res : null);
    } catch { setHistoryData(null); }
    finally { setHistoryLoading(false); }
  }, [historyFilters]);

  const openHistory = async (record) => {
    setHistoryData(null); setHistoryOpen(true);
    setHistoryFilters({ from: null, to: null, type: null });
    await loadHistory(record.id, { from: null, to: null, type: null });
  };

  // On-PO drill-down: the active PO lines whose remaining-to-receive sums to the
  // item's On-PO quantity (same availability service as everywhere else).
  const openOnPo = async (record) => {
    setOnPoModal({ open: true, item: record, loading: true, lines: [] });
    try {
      const lines = await window.electronAPI.getOnPoLines?.(record.id);
      setOnPoModal({ open: true, item: record, loading: false, lines: Array.isArray(lines) ? lines : [] });
    } catch {
      setOnPoModal({ open: true, item: record, loading: false, lines: [] });
    }
  };

  const historyRefCell = (m) => {
    const label = m.sourceType === 'invoice' ? (m.invoiceNumber || `INV-${m.sourceId}`)
      : m.sourceType === 'bill' ? (m.billRef || `BILL-${m.sourceId}`)
      : m.sourceType === 'receipt' ? (m.receiptNumber || `RCV-${m.sourceId}`)
      : m.refType || (String(m.reason || '').toUpperCase().includes('ADJUST') ? 'Adjustment' : 'Movement');
    if (m.sourceType === 'invoice' && m.sourceId != null) return <a onClick={() => routerHistory.push(`/main/customers/invoices/edit/${m.sourceId}`)}>{label}</a>;
    if (m.sourceType === 'bill' && m.sourceId != null) return <a onClick={() => routerHistory.push(`/main/vendors/bills/edit/${m.sourceId}`)}>{label}</a>;
    if (m.sourceType === 'receipt' && m.purchaseOrderId != null) return <a onClick={() => routerHistory.push('/main/vendors/purchasing/purchase-orders')}>{label}</a>;
    if (String(m.reason || '').toUpperCase().includes('ADJUST')) return <a onClick={() => setAdjDetail(m)}>{label}</a>;
    return <span>{label}</span>;
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        id: editingItem?.id,
        type: vals.type,
        name: vals.name,
        sku: vals.sku || '',
        isActive: vals.isActive !== false,
        description: vals.description || '',
        category: vals.category || '',
        subcategory: vals.subcategory || '',
        unitOfMeasure: vals.unitOfMeasure || '',
        purchaseCost: vals.purchaseCost,
        purchaseDescription: vals.purchaseDescription || '',
        preferredVendorId: vals.preferredVendorId,
        purchaseExpenseAccountId: vals.purchaseExpenseAccountId,
        purchaseTaxRateId: vals.purchaseTaxRateId,
        defaultPurchaseUnit: vals.defaultPurchaseUnit || '',
        vendorItemNumber: vals.vendorItemNumber || '',
        salesPrice: vals.salesPrice,
        salesDescription: vals.salesDescription || '',
        incomeAccountId: vals.incomeAccountId,
        salesTaxRateId: vals.salesTaxRateId,
        defaultSalesUnit: vals.defaultSalesUnit || '',
        inventoryAssetAccountId: vals.inventoryAssetAccountId,
        cogsAccountId: vals.cogsAccountId,
        reorderPoint: vals.reorderPoint,
        preferredStockLevel: vals.preferredStockLevel,
        valuationMethod: vals.valuationMethod,
        defaultWarehouseId: vals.defaultWarehouseId,
      };
      setSaving(true);
      const res = await window.electronAPI.saveItemMaster?.(payload);
      if (!res || res.success === false || res.error) {
        message.error(res?.error || 'Save failed');
        return;
      }
      message.success(editingItem ? 'Item updated' : 'Item created');
      setDrawerOpen(false);
      setEditingItem(null);
      form.resetFields();
      fetchItems();
    } catch (e) {
      if (!e?.errorFields) message.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteProduct?.(id);
      message.success('Item deleted');
      fetchItems();
    } catch { message.error('Delete failed'); }
  };

  const handleTableChange = (pag) => { setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize })); fetchItems(pag.current, pag.pageSize, search, typeFilter, categoryFilter); };
  const handleSearch = () => fetchItems(1, pagination.pageSize, search, typeFilter, categoryFilter);
  const handleTypeChange = (v) => { setTypeFilter(v || 'all'); fetchItems(1, pagination.pageSize, search, v || 'all', categoryFilter); };
  const handleCategoryChange = (v) => { setCategoryFilter(v || 'all'); fetchItems(1, pagination.pageSize, search, typeFilter, v || 'all'); };
  const handleStatusChange = (v) => { setStatusFilter(v || 'all'); fetchItems(1, pagination.pageSize, search, typeFilter, categoryFilter, v || 'all'); };
  const handleRefresh = () => fetchItems(pagination.current, pagination.pageSize, search, typeFilter, categoryFilter);

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.insertProductCategory?.(vals.cat_name);
      if (res?.error) { message.error(res.error); return; }
      setCatModalOpen(false); catForm.resetFields();
      const c = await window.electronAPI.getProductCategories?.();
      setCategories(Array.isArray(c) ? c : []);
      form.setFieldsValue({ category: vals.cat_name });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add category'); }
  };

  const handleAddSubcategory = async () => {
    try {
      const vals = await subForm.validateFields();
      const res = await window.electronAPI.insertItemSubcategory?.(vals.sub_category, vals.sub_name);
      if (res?.error || res?.success === false) { message.error(res?.error || 'Failed'); return; }
      setSubModalOpen(false); subForm.resetFields();
      loadSubcategories(vals.sub_category);
      form.setFieldsValue({ subcategory: vals.sub_name });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add subcategory'); }
  };

  const handleAddUnit = async () => {
    try {
      const vals = await unitForm.validateFields();
      const res = await window.electronAPI.insertUnitOfMeasure?.(vals.unit_name);
      if (res?.error || res?.success === false) { message.error(res?.error || 'Failed'); return; }
      setUnitModalOpen(false); unitForm.resetFields();
      const u = await window.electronAPI.getUnitsOfMeasure?.();
      setUnits(Array.isArray(u) ? u : []);
      form.setFieldsValue({ unitOfMeasure: vals.unit_name });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add unit'); }
  };

  const exportCSV = () => {
    try {
      const headers = ['sku', 'name', 'type', 'category', 'subcategory', 'unit_of_measure', 'price', 'purchase_cost', 'inventory_stock', 'is_active'];
      const rows = items.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `items_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  const handlePrint = () => {
    if (!items.length) { message.warning('No data to print'); return; }
    const rowsHtml = items.map(r => `<tr>
      <td>${r.sku || '-'}</td>
      <td>${(r.name || '-').replace(/</g, '&lt;')}</td>
      <td>${itemTypeLabel(r.type)}</td>
      <td>${(r.category || '-').replace(/</g, '&lt;')}</td>
      <td style="text-align:right">${cSym} ${Number(r.price || 0).toFixed(2)}</td>
    </tr>`).join('');
    const html = `<!doctype html><html><head><title>Products &amp; Services</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5}
    </style></head><body>
      <h2>Products &amp; Services</h2>
      <p>Printed: ${new Date().toLocaleDateString()} · ${items.length} item${items.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>SKU / Code</th><th>Name</th><th>Type</th><th>Category</th><th>Price</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.print();window.close();</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const columns = [
    {
      title: 'SKU / Code', key: 'sku', width: 120,
      sorter: (a, b) => (a.sku || '').localeCompare(b.sku || ''),
      render: (_, r) => r.sku ? <Text code style={{ fontSize: 11 }}>{r.sku}</Text> : '-',
    },
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (v, r) => (
        <Space size={8}>
          <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {(v || '?').charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div>
              {normalizeTypeCode(r.type) === 'INVENTORY_PART'
                ? <a onClick={() => openHistory(r)} style={{ fontWeight: 600 }} title="Open inventory history">{v || '-'}</a>
                : <a onClick={() => openView(r)} style={{ fontWeight: 500 }}>{v || '-'}</a>}
            </div>
            {r.is_active != null && !Number(r.is_active) && <Tag color="default" style={{ fontSize: 10, lineHeight: '16px' }}>Inactive</Tag>}
          </div>
        </Space>
      ),
    },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (v, r) => v ? <Tag color="#f0f0f0" style={{ color: '#595959', borderRadius: 4 }}>{v}{r.subcategory ? ` → ${r.subcategory}` : ''}</Tag> : '-' },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 160,
      render: v => {
        const code = normalizeTypeCode(v);
        const lbl = itemTypeLabel(v) || 'Non-Inventory Part';
        return <Tag color={TYPE_COLORS[code] || 'default'} style={{ borderRadius: 20, padding: '2px 10px' }}>{lbl}</Tag>;
      },
    },
    {
      title: 'Price', key: 'price', width: 120, align: 'right',
      sorter: (a, b) => Number(a.price || 0) - Number(b.price || 0),
      render: (_, r) => <span style={{ fontWeight: 600 }}>{cSym} {Number(r.price || 0).toFixed(2)}</span>,
    },
    {
      title: 'On Hand', key: 'onHand', width: 90, align: 'right',
      sorter: (a, b) => stockOf(a) - stockOf(b),
      render: (_, r) => {
        if (normalizeTypeCode(r.type) !== 'INVENTORY_PART') return <Text type="secondary">—</Text>;
        const s = stockOf(r);
        return <span style={{ fontWeight: 600, color: s <= 0 ? '#cf1322' : s < 10 ? '#fa8c16' : '#3f8600' }}>{s}</span>;
      },
    },
    {
      title: 'On PO', key: 'onPo', width: 80, align: 'right',
      render: (_, r) => {
        if (normalizeTypeCode(r.type) !== 'INVENTORY_PART') return <Text type="secondary">—</Text>;
        const v = Number(r.on_po || 0);
        if (v <= 0) return <Text type="secondary">0</Text>;
        return <Tooltip title="View open purchase orders"><a onClick={() => openOnPo(r)} style={{ fontWeight: 600, color: '#13c2c2' }}>{v}</a></Tooltip>;
      },
    },
    {
      title: 'Expected', key: 'expected', width: 90, align: 'right',
      render: (_, r) => {
        if (normalizeTypeCode(r.type) !== 'INVENTORY_PART') return <Text type="secondary">—</Text>;
        const e = r.expected != null ? Number(r.expected) : stockOf(r);
        return <Tooltip title="Expected = On Hand + outstanding quantity on active Purchase Orders"><span style={{ fontWeight: 600 }}>{e}</span></Tooltip>;
      },
    },
    {
      title: 'Status', key: 'stockStatus', width: 120,
      render: (_, r) => {
        if (normalizeTypeCode(r.type) !== 'INVENTORY_PART') return <Text type="secondary">—</Text>;
        const s = r.stock_status;
        if (!s) return <Text type="secondary">—</Text>;
        const color = s === 'OUT_OF_STOCK' ? 'red' : s === 'LOW_STOCK' ? 'orange' : 'green';
        const label = s === 'OUT_OF_STOCK' ? 'Out of Stock' : s === 'LOW_STOCK' ? 'Low Stock' : 'In Stock';
        return <Tag color={color} style={{ borderRadius: 20, padding: '1px 10px' }}>{label}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 130, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} style={{ color: '#1890ff' }} onClick={() => openView(r)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} style={{ color: '#595959' }} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="Delete item?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statTile = (grad, Icon) => (
    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: grad, color: '#fff', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 10px rgba(16,24,40,0.12)' }}><Icon /></div>
  );

  return (
    <div className="al-modern-page" style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg,#722ed1,#b37feb)' }}><AppstoreOutlined /></div>
          <div>
            <Title level={3} style={{ margin: 0 }}>Products &amp; Services</Title>
            <Text type="secondary">Inventory parts, non-inventory parts and services</Text>
          </div>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 4px 12px rgba(114,46,209,0.3)', fontWeight: 600 }} onClick={openAdd}>
          New Item
        </Button>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #1890ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {statTile('linear-gradient(135deg,#1890ff,#69c0ff)', AppstoreOutlined)}
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Items</Text><Text strong style={{ fontSize: 18 }}>{pagination.total}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #1890ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {statTile('linear-gradient(135deg,#1890ff,#69c0ff)', BoxPlotOutlined)}
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Inventory Parts</Text><Text strong style={{ fontSize: 18, color: '#1890ff' }}>{typeCounts.INVENTORY_PART}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #13c2c2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {statTile('linear-gradient(135deg,#13c2c2,#5cdbd3)', ShoppingOutlined)}
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Non-Inventory Parts</Text><Text strong style={{ fontSize: 18, color: '#13c2c2' }}>{typeCounts.NON_INVENTORY_PART}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #722ed1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {statTile('linear-gradient(135deg,#722ed1,#b37feb)', FileTextOutlined)}
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Services</Text><Text strong style={{ fontSize: 18, color: '#722ed1' }}>{typeCounts.SERVICE}</Text></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table card */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="Search name, SKU, description..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: 220, borderRadius: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            onClear={() => { setSearch(''); fetchItems(1, pagination.pageSize, '', typeFilter, categoryFilter); }}
          />
          <Select value={typeFilter} onChange={handleTypeChange} style={{ width: 170, borderRadius: 8 }} placeholder="Type">
            <Option value="all">All Types</Option>
            {typeOptions().map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
          </Select>
          <Select value={categoryFilter} onChange={handleCategoryChange} style={{ width: 160, borderRadius: 8 }} placeholder="Category">
            <Option value="all">All Categories</Option>
            {uniqueCategories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Select value={statusFilter} onChange={handleStatusChange} style={{ width: 150, borderRadius: 8 }} placeholder="Stock Status">
            <Option value="all">All Statuses</Option>
            <Option value="IN_STOCK">In Stock</Option>
            <Option value="LOW_STOCK">Low Stock</Option>
            <Option value="OUT_OF_STOCK">Out of Stock</Option>
          </Select>
          <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} style={{ borderRadius: 8 }} onClick={handleRefresh} /></Tooltip>
          <Tooltip title="Print"><Button icon={<PrinterOutlined />} style={{ borderRadius: 8 }} onClick={handlePrint} /></Tooltip>
          <Tooltip title="Download CSV"><Button icon={<DownloadOutlined />} style={{ borderRadius: 8 }} onClick={exportCSV} /></Tooltip>
          <span style={{ marginLeft: 'auto', color: '#8c8c8c', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarOutlined /> {cSym} {Number(totalValue || 0).toFixed(2)} in stock · {lowStockCount} low
          </span>
        </div>
        <Table columns={columns} dataSource={items} loading={loading} rowKey={r => r.id || r.sku || r.name}
          onChange={handleTableChange}
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} items`, style: { margin: 16 } }}
          size="middle" rowClassName={() => 'item-row'} />
      </Card>

      {/* ── Add / Edit Item drawer ─────────────────────────────────────────── */}
      <Drawer
        className="app-item-drawer"
        title={editingItem ? 'Edit Item' : 'New Item'}
        visible={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>Save Item</Button>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed) => { if (changed.type) setItemType(changed.type); if (changed.category) loadSubcategories(changed.category); }}
        >
          {/* ── BASIC INFORMATION ── */}
          <FormSection title="Basic Information" icon={<AppstoreOutlined />}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="type" label="Item Type" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select item type' }]}>
                  <Select>
                    {typeOptions().map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="sku" label="SKU / Item Code" style={FORM_ITEM_STYLE} tooltip="Must be unique within your company.">
                  <Input placeholder="e.g. W-100" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="isActive" label="Status" style={FORM_ITEM_STYLE} valuePropName="checked">
                  <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="name" label="Item Name" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Item Name is required' }]}>
              <Input placeholder="e.g. Widget A" />
            </Form.Item>
            <Form.Item name="description" label="Description" style={FORM_ITEM_STYLE}>
              <TextArea rows={2} placeholder="General description of the item" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="category" label="Category" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select category"
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                    {categories.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="subcategory" label="Subcategory" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select subcategory"
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => { subForm.setFieldsValue({ sub_category: form.getFieldValue('category') }); setSubModalOpen(true); }} style={{ width: '100%', textAlign: 'left' }}>Add New Subcategory</Button></>)}>
                    {subcategories.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="unitOfMeasure" label="Unit of Measure" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select unit"
                    dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setUnitModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Unit</Button></>)}>
                    {units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </FormSection>

          {/* ── PURCHASE INFORMATION ── */}
          {showSection('purchase') && (
          <FormSection title="Purchase Information" icon={<ShoppingOutlined />}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="purchaseCost" label="Purchase Cost" style={FORM_ITEM_STYLE}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix={cSym} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="preferredVendorId" label="Preferred Vendor" style={FORM_ITEM_STYLE}>
                  <Select allowClear showSearch optionFilterProp="children" placeholder="Select vendor">
                    {vendors.map(v => <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || v.company_name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="purchaseExpenseAccountId" label="Expense / COGS Account" style={FORM_ITEM_STYLE}
                  tooltip="The account debited when this item is purchased (non-inventory / service). Inventory Parts post to the Inventory Asset account instead.">
                  <AccountSelect accounts={accounts} allowedTypes={EXPENSE_ACCOUNT_TYPES} placeholder="Select expense / COGS account" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="purchaseTaxRateId" label="Purchase Tax Code" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select tax code">
                    {vatRates.map(v => <Option key={v.id} value={v.id}>{v.vat_name}{v.vat_percentage != null ? ` (${v.vat_percentage}%)` : ''}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="defaultPurchaseUnit" label="Default Purchase Unit" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select unit">
                    {units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="vendorItemNumber" label="Vendor Item #" style={FORM_ITEM_STYLE}>
                  <Input placeholder="Vendor's own SKU (e.g. ABC-100)" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="purchaseDescription" label="Purchase Description" style={FORM_ITEM_STYLE}>
              <Input placeholder="Default description used on bills / purchases" />
            </Form.Item>
          </FormSection>
          )}

          {/* ── SALES INFORMATION ── */}
          {showSection('sales') && (
          <FormSection title="Sales Information" icon={<DollarOutlined />}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="salesPrice" label="Sales Price / Rate" style={FORM_ITEM_STYLE}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix={cSym} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="incomeAccountId" label="Income Account" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select Income Account' }]}>
                  <AccountSelect accounts={accounts} allowedTypes={INCOME_ACCOUNT_TYPES} placeholder="Select income account" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="salesTaxRateId" label="Sales Tax Code" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select tax code">
                    {vatRates.map(v => <Option key={v.id} value={v.id}>{v.vat_name}{v.vat_percentage != null ? ` (${v.vat_percentage}%)` : ''}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="defaultSalesUnit" label="Default Sales Unit" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select unit">
                    {units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="salesDescription" label="Sales Description" style={FORM_ITEM_STYLE} tooltip="Default description used on quotes / invoices. Falls back to the Item Description / Name.">
                  <Input placeholder="Default description used on quotes / invoices" />
                </Form.Item>
              </Col>
            </Row>
          </FormSection>
          )}

          {/* ── INVENTORY INFORMATION (Inventory Part only) ── */}
          {showSection('inventory') && (
            <FormSection title="Inventory Information" icon={<BoxPlotOutlined />}>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="inventoryAssetAccountId" label="Inventory Asset Account" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select Inventory Asset Account' }]}>
                    <AccountSelect accounts={accounts} allowedTypes={INVENTORY_ASSET_ACCOUNT_TYPES} placeholder="Select inventory asset account" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="cogsAccountId" label="COGS Account" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select COGS Account' }]}>
                    <AccountSelect accounts={accounts} allowedTypes={COGS_ACCOUNT_TYPES} placeholder="Select COGS account" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="Stock Availability" style={FORM_ITEM_STYLE}
                    tooltip="On Hand comes from inventory movements. On Purchase Order is the outstanding quantity on active POs. Expected = On Hand + On PO."
                    extra={<Text type="secondary" style={{ fontSize: 11 }}>Read-only — managed through inventory transactions and Purchase Orders.</Text>}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                      <span><Text type="secondary" style={{ fontSize: 11 }}>On Hand </Text><Text strong>{stockOf(editingItem)}</Text></span>
                      <span><Text type="secondary" style={{ fontSize: 11 }}>On PO </Text><Text strong style={{ color: '#13c2c2' }}>{Number((editingItem && editingItem.availability && editingItem.availability.onPurchaseOrder) || 0)}</Text></span>
                      <span><Text type="secondary" style={{ fontSize: 11 }}>Expected </Text><Text strong style={{ color: '#52c41a' }}>{Number((editingItem && editingItem.availability && editingItem.availability.expected) != null ? editingItem.availability.expected : stockOf(editingItem))}</Text></span>
                    </div>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="reorderPoint" label="Reorder Point" style={FORM_ITEM_STYLE}
                    tooltip="Low Stock is shown when Quantity On Hand is at or below the Reorder Point.">
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="e.g. 10" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="preferredStockLevel" label="Preferred Stock Level" style={FORM_ITEM_STYLE}>
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="e.g. 50" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="valuationMethod" label="Inventory Valuation Method" style={FORM_ITEM_STYLE}>
                    <Select>
                      {VALUATION_METHODS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              {warehouses.length > 0 && (
                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item name="defaultWarehouseId" label="Default Warehouse" style={FORM_ITEM_STYLE}
                      tooltip="Stock for this item is received into and issued from this warehouse unless a transaction chooses another. Changing it later does not move historical stock.">
                      <Select allowClear placeholder="Use company default warehouse">
                        {warehouses.map(w => <Option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (default)' : ''}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </FormSection>
          )}
        </Form>
      </Drawer>

      {/* ── View Item detail (master + stock + movements + transactions) ──── */}
      <Drawer
        className="app-item-detail-drawer"
        title={viewDetail?.master ? `Item — ${viewDetail.master.name}` : 'Item'}
        visible={viewOpen}
        onClose={() => { setViewOpen(false); setViewDetail(null); }}
        destroyOnClose
        extra={viewDetail?.master ? <Button icon={<EditOutlined />} onClick={() => { const m = viewDetail.master; setViewOpen(false); openEdit(m); }}>Edit</Button> : null}
      >
        {viewLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="Loading item..." /></div>
        ) : !viewDetail?.master ? (
          <Empty description="Item not found" />
        ) : (() => {
          const m = viewDetail.master;
          const code = normalizeTypeCode(m.type);
          const cap = capabilities(code) || {};
          const s = viewDetail.summary || {};
          const av = viewDetail.availability || null;
          const stockStatus = viewDetail.stock_status;
          const statusLabel = stockStatus === 'OUT_OF_STOCK' ? 'Out of Stock' : stockStatus === 'LOW_STOCK' ? 'Low Stock' : stockStatus === 'IN_STOCK' ? 'In Stock' : '—';
          const statusColor = stockStatus === 'OUT_OF_STOCK' ? '#cf1322' : stockStatus === 'LOW_STOCK' ? '#fa8c16' : '#3f8600';
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Avatar size={48} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 700, fontSize: 20 }}>{(m.name || '?').charAt(0).toUpperCase()}</Avatar>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{m.name}</div>
                  <Space size={8} wrap>
                    <Tag color={TYPE_COLORS[code] || 'default'}>{itemTypeLabel(m.type)}</Tag>
                    {m.sku && <Text code>{m.sku}</Text>}
                    {m.is_active != null && !Number(m.is_active) ? <Tag color="default">Inactive</Tag> : <Tag color="green">Active</Tag>}
                  </Space>
                </div>
              </div>

              <Row gutter={12} style={{ marginBottom: 16 }}>
                {code === 'INVENTORY_PART' && av ? (
                  <>
                    <Col flex="1"><Card size="small"><Statistic title="On Hand" value={av.onHand || 0} precision={0} valueStyle={{ color: '#1890ff' }} /></Card></Col>
                    <Col flex="1"><Card size="small"><Statistic title="On Purchase Order" value={av.onPurchaseOrder || 0} precision={0} valueStyle={{ color: '#13c2c2' }} /></Card></Col>
                    <Col flex="1"><Card size="small"><Statistic title="Expected" value={av.expected || 0} precision={0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                    <Col flex="1"><Card size="small"><Statistic title="Reorder Point" value={m.reorder_point != null ? Number(m.reorder_point) : 0} precision={0} valueStyle={{ color: '#595959' }} /></Card></Col>
                    <Col flex="1"><Card size="small"><Statistic title="Status" value={statusLabel} valueStyle={{ color: statusColor, fontSize: 16 }} /></Card></Col>
                  </>
                ) : (
                  <>
                    <Col span={8}><Card size="small"><Statistic title="Purchased" value={s.purchaseValue || 0} precision={2} prefix={cSym} /></Card></Col>
                    <Col span={8}><Card size="small"><Statistic title="Sold" value={s.salesValue || 0} precision={2} prefix={cSym} /></Card></Col>
                    <Col span={8}><Card size="small"><Statistic title="Purchased Qty" value={s.purchaseQty || 0} precision={0} /></Card></Col>
                  </>
                )}
              </Row>

              {code === 'INVENTORY_PART' && (viewDetail.availabilityByWarehouse || []).length > 1 && (
                <Card size="small" title="Availability by Warehouse" style={{ marginBottom: 16 }}>
                  <Table
                    size="small"
                    rowKey={(r) => String(r.warehouseId)}
                    pagination={false}
                    dataSource={viewDetail.availabilityByWarehouse}
                    columns={[
                      { title: 'Warehouse', dataIndex: 'warehouseName', key: 'w' },
                      { title: 'On Hand', dataIndex: 'onHand', key: 'oh', align: 'right', width: 100 },
                      { title: 'On PO', dataIndex: 'onPurchaseOrder', key: 'op', align: 'right', width: 100,
                        render: (v) => Number(v) > 0 ? <Text strong style={{ color: '#13c2c2' }}>{Number(v)}</Text> : <Text type="secondary">0</Text> },
                      { title: 'Expected', dataIndex: 'expected', key: 'ex', align: 'right', width: 100,
                        render: (v) => <Text strong>{Number(v)}</Text> },
                    ]}
                  />
                </Card>
              )}

              <Tabs defaultActiveKey="overview">
                <Tabs.TabPane tab="Details" key="overview">
                  <Descriptions column={2} bordered size="small" title="Basic Information">
                    <Descriptions.Item label="Item Type">{itemTypeLabel(m.type)}</Descriptions.Item>
                    <Descriptions.Item label="SKU / Code">{m.sku || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Category">{m.category || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Subcategory">{m.subcategory || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Unit of Measure">{m.unit_of_measure || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Status">{m.is_active != null && !Number(m.is_active) ? 'Inactive' : 'Active'}</Descriptions.Item>
                    <Descriptions.Item label="Description" span={2}>{m.description || '—'}</Descriptions.Item>
                  </Descriptions>
                  <Descriptions column={2} bordered size="small" title="Purchase Information" style={{ marginTop: 16 }}>
                    <Descriptions.Item label="Purchase Cost">{fmtMoney(m.purchase_cost)}</Descriptions.Item>
                    <Descriptions.Item label="Preferred Vendor">{vendorLabel(m.preferred_vendor_id)}</Descriptions.Item>
                    <Descriptions.Item label="Expense / COGS Account">{accountLabel(m.purchase_expense_account_id)}</Descriptions.Item>
                    <Descriptions.Item label="Purchase Tax Code">{taxLabel(m.purchase_tax_rate_id)}</Descriptions.Item>
                    <Descriptions.Item label="Default Purchase Unit">{m.default_purchase_unit || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Vendor Item #">{m.vendor_item_number || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Purchase Description" span={2}>{m.purchase_description || '—'}</Descriptions.Item>
                  </Descriptions>
                  <Descriptions column={2} bordered size="small" title="Sales Information" style={{ marginTop: 16 }}>
                    <Descriptions.Item label="Sales Price / Rate">{fmtMoney(m.price)}</Descriptions.Item>
                    <Descriptions.Item label="Income Account">{accountLabel(m.income_account_id)}</Descriptions.Item>
                    <Descriptions.Item label="Sales Tax Code">{taxLabel(m.sales_tax_rate_id)}</Descriptions.Item>
                    <Descriptions.Item label="Default Sales Unit">{m.default_sales_unit || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Sales Description" span={2}>{m.sales_description || '—'}</Descriptions.Item>
                  </Descriptions>
                  {cap.needsInventoryAsset && (
                    <Descriptions column={2} bordered size="small" title="Inventory Information" style={{ marginTop: 16 }}>
                      <Descriptions.Item label="Inventory Asset Account">{accountLabel(m.inventory_asset_account_id)}</Descriptions.Item>
                      <Descriptions.Item label="COGS Account">{accountLabel(m.cogs_account_id)}</Descriptions.Item>
                      <Descriptions.Item label="Reorder Point">{m.reorder_point ?? 0}</Descriptions.Item>
                      <Descriptions.Item label="Preferred Stock Level">{m.preferred_stock_level ?? 0}</Descriptions.Item>
                      <Descriptions.Item label="Valuation Method" span={2}>{m.valuation_method || 'FIFO'}</Descriptions.Item>
                    </Descriptions>
                  )}
                </Tabs.TabPane>
                {cap.needsInventoryAsset && (
                  <Tabs.TabPane tab={`Stock (${(viewDetail.stock || []).length})`} key="stock">
                    <Table size="small" rowKey={(r, i) => r.id || i} dataSource={viewDetail.stock || []} pagination={false}
                      columns={[
                        { title: 'Warehouse', key: 'wh', render: (_, r) => r.warehouseName || r.warehouseCode || '-' },
                        { title: 'Quantity', dataIndex: 'quantity', align: 'right', render: v => Number(v || 0) },
                        { title: 'Reorder Point', dataIndex: 'reorderPoint', align: 'right', render: v => Number(v || 0) },
                      ]}
                      locale={{ emptyText: 'No stock on hand.' }} />
                  </Tabs.TabPane>
                )}
                <Tabs.TabPane tab={`Movements (${(viewDetail.movements || []).length})`} key="movements">
                  <Table size="small" rowKey={(r, i) => r.id || i} dataSource={viewDetail.movements || []} pagination={{ pageSize: 10 }}
                    columns={[
                      { title: 'Date', dataIndex: 'movedAt', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                      { title: 'Reason', dataIndex: 'reason', render: v => v || '-' },
                      { title: 'Change', dataIndex: 'quantityChange', align: 'right', render: v => <span style={{ color: Number(v) < 0 ? '#cf1322' : '#3f8600', fontWeight: 600 }}>{Number(v || 0)}</span> },
                      { title: 'Unit Cost', dataIndex: 'unitCost', align: 'right', render: v => v == null ? '-' : fmtMoney(v) },
                      { title: 'Source', key: 'source', render: (_, r) => r.sourceLabel || r.source || '-' },
                    ]}
                    locale={{ emptyText: 'No stock movements.' }} />
                </Tabs.TabPane>
                <Tabs.TabPane tab={`Transactions (${(viewDetail.purchases || []).length + (viewDetail.sales || []).length})`} key="txns">
                  <Text strong>Purchases / Bills</Text>
                  <Table size="small" style={{ marginBottom: 16 }} rowKey={(r, i) => `p${r.source_id}-${i}`} dataSource={viewDetail.purchases || []} pagination={{ pageSize: 5 }}
                    columns={[
                      { title: 'Date', dataIndex: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                      { title: 'Ref', dataIndex: 'reference', render: v => v || '-' },
                      { title: 'Vendor', dataIndex: 'party', render: v => v || '-' },
                      { title: 'Qty', dataIndex: 'quantity', align: 'right', render: v => v == null ? '-' : Number(v) },
                      { title: 'Rate', dataIndex: 'rate', align: 'right', render: v => v == null ? '-' : fmtMoney(v) },
                      { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => fmtMoney(v) },
                    ]}
                    locale={{ emptyText: 'No purchases.' }} />
                  <Text strong>Sales / Invoices</Text>
                  <Table size="small" rowKey={(r, i) => `s${r.source_id}-${i}`} dataSource={viewDetail.sales || []} pagination={{ pageSize: 5 }}
                    columns={[
                      { title: 'Date', dataIndex: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                      { title: 'Ref', dataIndex: 'reference', render: v => v || '-' },
                      { title: 'Customer', dataIndex: 'party', render: v => v || '-' },
                      { title: 'Qty', dataIndex: 'quantity', align: 'right', render: v => v == null ? '-' : Number(v) },
                      { title: 'Rate', dataIndex: 'rate', align: 'right', render: v => v == null ? '-' : fmtMoney(v) },
                      { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => fmtMoney(v) },
                    ]}
                    locale={{ emptyText: 'No sales.' }} />
                </Tabs.TabPane>
              </Tabs>
            </>
          );
        })()}
      </Drawer>

      {/* On-PO drill-down: active PO lines contributing to the item's On-PO qty */}
      <Modal
        title={onPoModal.item ? `On Purchase Order — ${onPoModal.item.name || onPoModal.item.sku || ''}` : 'On Purchase Order'}
        visible={onPoModal.open}
        onCancel={() => setOnPoModal({ open: false, item: null, loading: false, lines: [] })}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Table
          rowKey={(r) => `${r.poId}-${r.remaining}-${r.poNumber}`}
          size="small"
          loading={onPoModal.loading}
          dataSource={onPoModal.lines || []}
          pagination={false}
          locale={{ emptyText: <Empty description="No open purchase orders for this item." /> }}
          columns={[
            { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => { setOnPoModal({ open: false, item: null, loading: false, lines: [] }); routerHistory.push(`/main/vendors/purchasing/purchase-orders?po=${r.poId}`); }} style={{ fontWeight: 600 }}>{r.poNumber}</a> },
            { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendorId != null ? <a onClick={() => { setOnPoModal({ open: false, item: null, loading: false, lines: [] }); routerHistory.push(`/main/vendors/details/${r.vendorId}`); }}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
            { title: 'Ordered', dataIndex: 'qtyOrdered', key: 'o', width: 90, align: 'right' },
            { title: 'Received', dataIndex: 'qtyReceived', key: 'r', width: 90, align: 'right' },
            { title: 'Remaining', dataIndex: 'remaining', key: 'rem', width: 100, align: 'right', render: (v) => <Text strong style={{ color: '#13c2c2' }}>{Number(v)}</Text> },
            { title: 'Expected Date', dataIndex: 'expectedDate', key: 'exp', width: 120, render: (d) => d ? moment(d).format('MM/DD/YYYY') : '—' },
            { title: 'Status', dataIndex: 'poStatus', key: 'st', width: 120, render: (v) => <Tag>{PO_STATUS_LABEL[v] || v}</Tag> },
          ]}
        />
        {!onPoModal.loading && (onPoModal.lines || []).length > 0 && (
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <Text strong>Total On PO: {Number((onPoModal.lines || []).reduce((s, r) => s + Number(r.remaining || 0), 0))}</Text>
          </div>
        )}
      </Modal>

      {/* Add Category Modal */}
      <Modal title="Add New Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={catForm} layout="vertical" preserve={false}>
          <Form.Item name="cat_name" label="Category Name" rules={[{ required: true, message: 'Enter category name' }]}><Input placeholder="e.g. Electronics" /></Form.Item>
        </Form>
      </Modal>

      {/* Add Subcategory Modal */}
      <Modal title="Add New Subcategory" visible={subModalOpen} onOk={handleAddSubcategory} onCancel={() => setSubModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={subForm} layout="vertical" preserve={false}>
          <Form.Item name="sub_category" label="Category"><Select allowClear placeholder="Select category">{categories.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}</Select></Form.Item>
          <Form.Item name="sub_name" label="Subcategory Name" rules={[{ required: true, message: 'Enter subcategory name' }]}><Input placeholder="e.g. Routers" /></Form.Item>
        </Form>
      </Modal>

      {/* Add Unit Modal */}
      <Modal title="Add Unit of Measure" visible={unitModalOpen} onOk={handleAddUnit} onCancel={() => setUnitModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={unitForm} layout="vertical" preserve={false}>
          <Form.Item name="unit_name" label="Unit Name" rules={[{ required: true, message: 'Enter unit name' }]}><Input placeholder="e.g. Each, Hour, Box" /></Form.Item>
        </Form>
      </Modal>

      {/* ── Product / Inventory History (running balance) ─────────────────── */}
      <Drawer
        className="app-item-detail-drawer"
        title={historyData?.master ? `Inventory History — ${historyData.master.name}` : 'Inventory History'}
        visible={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistoryData(null); }}
        destroyOnClose
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="Loading product history..." /></div>
        ) : !historyData?.master ? (
          <Empty description="No history available" />
        ) : (() => {
          const m = historyData.master;
          const s = historyData.summary || {};
          const rows = (historyData.rows || []).slice().reverse(); // newest first for display
          return (
            <>
              <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col span={6}><Card size="small"><Statistic title="Current Stock" value={s.currentStock || 0} precision={0} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Total Received" value={s.totalIn || 0} valueStyle={{ color: '#3f8600' }} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Total Sold / Out" value={s.totalOut || 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Inventory Value" value={s.inventoryValue || 0} precision={2} prefix={cSym} /></Card></Col>
              </Row>

              <Space wrap style={{ marginBottom: 12 }}>
                <DatePicker.RangePicker
                  value={[historyFilters.from, historyFilters.to]}
                  onChange={(r) => { const f = { ...historyFilters, from: r?.[0] || null, to: r?.[1] || null }; setHistoryFilters(f); loadHistory(m.id, f); }}
                  format="MM/DD/YYYY"
                />
                <Select
                  value={historyFilters.type || 'all'}
                  style={{ width: 170 }}
                  onChange={(v) => { const f = { ...historyFilters, type: v === 'all' ? null : v }; setHistoryFilters(f); loadHistory(m.id, f); }}
                  options={[
                    { value: 'all', label: 'All Types' },
                    { value: 'RECEIPT', label: 'Purchases / Receipts' },
                    { value: 'SALE', label: 'Sales' },
                    { value: 'ADJUSTMENT', label: 'Adjustments' },
                  ]}
                />
                <Button icon={<ReloadOutlined />} onClick={() => loadHistory(m.id)}>Refresh</Button>
              </Space>

              <Table
                size="small"
                rowKey="id"
                loading={historyLoading}
                dataSource={rows}
                pagination={{ pageSize: 25, showTotal: t => `${t} movements` }}
                columns={[
                  { title: 'Date', dataIndex: 'movedAt', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                  { title: 'Transaction', key: 'txn', width: 120, render: (_, r) => <Tag color={r.sourceType === 'invoice' ? 'green' : r.sourceType === 'receipt' ? 'blue' : 'default'}>{(r.reason || r.refType || 'Movement')}</Tag> },
                  { title: 'Reference', key: 'ref', width: 130, render: (_, r) => historyRefCell(r) },
                  { title: 'Vendor / Customer', key: 'party', ellipsis: true, render: (_, r) => r.vendorName || r.customerName || '-' },
                  { title: 'Location', key: 'wh', width: 110, render: (_, r) => r.warehouseName || '-' },
                  { title: 'Qty In', dataIndex: 'quantityChange', width: 80, align: 'right', render: v => Number(v) > 0 ? <span style={{ color: '#3f8600' }}>{Number(v)}</span> : '' },
                  { title: 'Qty Out', dataIndex: 'quantityChange', key: 'out', width: 80, align: 'right', render: v => Number(v) < 0 ? <span style={{ color: '#cf1322' }}>{Math.abs(Number(v))}</span> : '' },
                  { title: 'Balance', dataIndex: 'balance', width: 90, align: 'right', render: v => <Text strong>{Number(v)}</Text> },
                ]}
                locale={{ emptyText: 'No inventory movements for this item.' }}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                The running balance is calculated chronologically from the movement ledger, so Current Stock always equals the final balance.
              </Text>
            </>
          );
        })()}
      </Drawer>

      {/* Adjustment detail */}
      <Modal
        title="Stock Adjustment"
        visible={!!adjDetail}
        onCancel={() => setAdjDetail(null)}
        footer={<Button onClick={() => setAdjDetail(null)}>Close</Button>}
        destroyOnClose
      >
        {adjDetail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Date">{adjDetail.movedAt ? moment(adjDetail.movedAt).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
            <Descriptions.Item label="Adjustment Quantity">{adjDetail.quantityChange}</Descriptions.Item>
            <Descriptions.Item label="Reason">{adjDetail.reason || '-'}</Descriptions.Item>
            <Descriptions.Item label="Location">{adjDetail.warehouseName || '-'}</Descriptions.Item>
            <Descriptions.Item label="Unit Cost">{adjDetail.unitCost == null ? '-' : fmtMoney(adjDetail.unitCost)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default UnifiedItemList;
