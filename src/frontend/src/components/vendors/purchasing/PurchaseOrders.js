import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Table, Button, Drawer, Form, Input, InputNumber, Select, Space, message, Tag, Row, Col, Tooltip, Popconfirm, DatePicker, Divider, Typography, Descriptions, Tabs, Statistic, Empty, Dropdown, Menu, Skeleton, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, ShoppingCartOutlined, InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, PrinterOutlined, MailOutlined, MoreOutlined, DollarOutlined, FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory, useLocation } from 'react-router-dom';
import { useCurrency } from '../../../utils/currency';
import { sumMoney } from '../../../utils/money';
import { itemTypeLabel, capabilities, normalizeTypeCode } from '../../../utils/itemTypes';
import FormSection, { FORM_ITEM_STYLE } from '../../shared/FormSection';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

const STATUS_COLORS = {
  DRAFT: 'default', OPEN: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'cyan',
  PARTIALLY_BILLED: 'gold', BILLED: 'green', CLOSED: 'purple', CANCELLED: 'red',
};
const STATUS_LABELS = {
  DRAFT: 'Draft', OPEN: 'Open', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received',
  PARTIALLY_BILLED: 'Partially Billed', BILLED: 'Billed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const statusLabel = (s) => STATUS_LABELS[s] || s || 'Draft';
const statusColor = (s) => STATUS_COLORS[s] || 'default';

// Same Terms dropdown as the Invoice / Enter Bill forms.
const TERMS_OPTIONS = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
];
const termsLabel = (v) => {
  if (v == null || v === '') return '';
  const opt = TERMS_OPTIONS.find(o => String(o.value) === String(v));
  return opt ? opt.label : String(v);
};
const termsValue = (v) => {
  if (v == null || v === '') return undefined;
  const byValue = TERMS_OPTIONS.find(o => String(o.value) === String(v));
  if (byValue) return byValue.value;
  const byLabel = TERMS_OPTIONS.find(o => o.label.toLowerCase() === String(v).toLowerCase());
  return byLabel ? byLabel.value : undefined;
};
const vendorAddress = (v) => {
  if (!v) return '';
  return [v.address1, v.address2, v.city, v.state, v.postal_code, v.country].filter(Boolean).join(', ');
};

const makeLine = (overrides = {}) => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemId: undefined, description: '', itemType: '', unit: '',
  qtyOrdered: 1, unitCost: 0, taxRate: 0, amount: 0,
  warehouseId: undefined,
  ...overrides,
});

const PurchaseOrders = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const fmtMoney = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState(null);

  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vatRates, setVatRates] = useState([]);

  // Form drawer
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [lines, setLines] = useState([makeLine()]);
  const [saving, setSaving] = useState(false);

  // Receive drawer
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivePo, setReceivePo] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);
  const [receiptMeta, setReceiptMeta] = useState({ receiptDate: moment(), reference: '', warehouseId: undefined, memo: '' });
  const [receiving, setReceiving] = useState(false);

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const location = useLocation();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptDetail, setReceiptDetail] = useState(null);

  const loadLookups = useCallback(async () => {
    try {
      const [v, it, wh, vats] = await Promise.all([
        window.electronAPI.getAllSuppliers?.().catch(() => []),
        window.electronAPI.getAllProducts?.().catch(() => []),
        window.electronAPI.getWarehouses?.().catch(() => []),
        window.electronAPI.getAllVat?.().catch(() => []),
      ]);
      setVendors(Array.isArray(v) ? v : (v?.all || v?.data || []));
      setItems(Array.isArray(it) ? it : (it?.all || it?.data || []));
      setWarehouses(Array.isArray(wh) ? wh : []);
      setVatRates(Array.isArray(vats) ? vats : (vats?.all || vats?.data || []));
    } catch (e) { console.error('PO lookups failed:', e); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getPurchaseOrders?.({ search, status: statusFilter, vendorId: vendorFilter });
      setRows(Array.isArray(res) ? res : []);
    } catch { message.error('Failed to load purchase orders'); setRows([]); }
    setLoading(false);
  }, [search, statusFilter, vendorFilter]);

  useEffect(() => { loadLookups(); }, [loadLookups]);
  useEffect(() => { load(); }, [load]);

  const itemById = useMemo(() => new Map(items.map(i => [Number(i.id), i])), [items]);
  const purchasableItems = useMemo(() => items.filter(i => (i.is_active == null || Number(i.is_active))), [items]);
  const defaultWarehouseId = useMemo(() => {
    const def = warehouses.find(w => w.isDefault) || warehouses[0];
    return def ? Number(def.id) : undefined;
  }, [warehouses]);

  // ── Totals ──
  const subtotal = sumMoney(lines.map(l => Number(l.amount) || 0));
  const taxTotal = sumMoney(lines.map(l => (Number(l.amount) || 0) * ((Number(l.taxRate) || 0) / 100)));
  const grandTotal = sumMoney([subtotal, taxTotal]);

  const recalc = (l) => ({ ...l, amount: sumMoney([(Number(l.qtyOrdered) || 0) * (Number(l.unitCost) || 0)]) });

  const updateLine = (key, field, value) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    const next = { ...l, [field]: value };
    if (field === 'qtyOrdered' || field === 'unitCost') return recalc(next);
    return next;
  }));

  const selectItem = (key, itemId) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    if (itemId == null) return { ...l, itemId: undefined, description: '', itemType: '', unit: '' };
    const it = itemById.get(Number(itemId));
    if (!it) return l;
    // Purchase tax defaults from the Item Master's Purchase Tax Code; the user
    // can still override it on this line. Never hardcoded to zero.
    const vat = it.purchase_tax_rate_id != null
      ? vatRates.find(r => Number(r.id) === Number(it.purchase_tax_rate_id))
      : null;
    const next = {
      ...l,
      itemId: Number(itemId),
      itemType: normalizeTypeCode(it.type) || '',
      description: it.purchase_description || it.description || it.name || '',
      unit: it.default_purchase_unit || it.unit_of_measure || '',
      unitCost: Number(it.purchase_cost) || 0,
      taxRate: vat ? (Number(vat.vat_percentage) || 0) : 0,
      warehouseId: l.warehouseId != null ? l.warehouseId : defaultWarehouseId,
    };
    return recalc(next);
  }));

  const addLine = () => setLines(prev => [...prev, makeLine()]);
  const removeLine = (key) => setLines(prev => (prev.length > 1 ? prev.filter(l => l.key !== key) : prev));

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ poDate: moment(), expectedDate: moment().add(7, 'days') });
    setLines([makeLine()]);
    setFormOpen(true);
  };

  const openEdit = async (record) => {
    try {
      const po = await window.electronAPI.getPurchaseOrder?.(record.id);
      if (!po) { message.error('Purchase Order not found'); return; }
      setEditing(po);
      form.setFieldsValue({
        vendorId: Number(po.vendor_id),
        poNumber: po.po_number,
        poDate: po.po_date ? moment(po.po_date) : moment(),
        expectedDate: po.expected_date ? moment(po.expected_date) : undefined,
        shipTo: po.ship_to || vendorAddress(vendors.find(x => Number(x.id) === Number(po.vendor_id))) || '',
        terms: termsValue(po.terms),
        memo: po.memo || '',
      });
      setLines((po.lines || []).map(l => makeLine({
        itemId: l.item_id != null ? Number(l.item_id) : undefined,
        description: l.description || '', itemType: l.item_type || '', unit: l.unit || '',
        qtyOrdered: Number(l.qty_ordered) || 0, unitCost: Number(l.unit_cost) || 0,
        taxRate: Number(l.tax_rate) || 0, amount: Number(l.amount) || 0,
        warehouseId: l.warehouse_id != null ? Number(l.warehouse_id) : undefined,
      })));
      setFormOpen(true);
    } catch { message.error('Failed to load Purchase Order'); }
  };

  const handleSave = async (openAfter) => {
    try {
      const vals = await form.validateFields();
      const payload = {
        id: editing?.id,
        vendorId: vals.vendorId,
        poNumber: vals.poNumber,
        poDate: vals.poDate ? vals.poDate.format('YYYY-MM-DD') : null,
        expectedDate: vals.expectedDate ? vals.expectedDate.format('YYYY-MM-DD') : null,
        shipTo: vals.shipTo || '',
        terms: vals.terms || '',
        memo: vals.memo || '',
        lines: lines.filter(l => l.itemId != null || Number(l.amount) > 0).map(l => ({
          itemId: l.itemId, description: l.description, itemType: l.itemType, unit: l.unit,
          qtyOrdered: l.qtyOrdered, unitCost: l.unitCost, taxRate: l.taxRate, amount: l.amount,
          warehouseId: l.warehouseId,
        })),
      };
      if (!payload.lines.length) { message.error('Add at least one line item.'); return; }
      setSaving(true);
      const res = await window.electronAPI.savePurchaseOrder?.(payload);
      if (!res || res.success === false || res.error) { message.error(res?.error || 'Save failed'); return; }
      if (openAfter) await window.electronAPI.setPurchaseOrderStatus?.(res.id, 'OPEN');
      message.success(editing ? 'Purchase Order updated' : 'Purchase Order created');
      setFormOpen(false); setEditing(null); form.resetFields(); setLines([makeLine()]);
      load();
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const openReceive = async (record) => {
    try {
      const po = await window.electronAPI.getPurchaseOrder?.(record.id);
      if (!po) return;
      const linesToReceive = (po.lines || []).map(l => {
        const remaining = (Number(l.qty_ordered) || 0) - (Number(l.qty_received) || 0);
        const isInv = capabilities(l.item_type)?.tracksQuantity;
        return {
          key: l.id, lineId: l.id, description: l.description || `Item #${l.item_id}`,
          itemType: l.item_type, ordered: Number(l.qty_ordered) || 0,
          previouslyReceived: Number(l.qty_received) || 0, remaining,
          receiveNow: isInv ? Math.max(0, remaining) : 0, tracksInventory: !!isInv,
        };
      });
      setReceivePo(po);
      setReceiveLines(linesToReceive);
      setReceiptMeta({ receiptDate: moment(), reference: '', warehouseId: warehouses.find(w => w.isDefault)?.id || warehouses[0]?.id, memo: '' });
      setReceiveOpen(true);
    } catch { message.error('Failed to load Purchase Order'); }
  };

  const handleReceive = async () => {
    const payload = {
      receiptDate: receiptMeta.receiptDate ? receiptMeta.receiptDate.format('YYYY-MM-DD') : null,
      reference: receiptMeta.reference || '',
      warehouseId: receiptMeta.warehouseId,
      memo: receiptMeta.memo || '',
      lines: receiveLines.filter(l => Number(l.receiveNow) > 0).map(l => ({ purchaseOrderLineId: l.lineId, qtyReceived: Number(l.receiveNow) })),
    };
    if (!payload.lines.length) { message.error('Enter a quantity to receive.'); return; }
    setReceiving(true);
    try {
      const res = await window.electronAPI.receivePurchaseOrder?.(receivePo.id, payload);
      if (!res || res.success === false || res.error) { message.error(res?.error || 'Receiving failed'); return; }
      message.success(`Received items on ${res.receiptNumber || 'receipt'}`);
      setReceiveOpen(false); setReceivePo(null);
      load();
    } finally { setReceiving(false); }
  };

  const openDetail = async (record) => {
    setDetail(null); setDetailOpen(true); setDetailLoading(true);
    try {
      const po = await window.electronAPI.getPurchaseOrder?.(record.id);
      setDetail(po && !po.error ? po : null);
    } finally { setDetailLoading(false); }
  };

  const reloadDetail = async () => {
    if (!detail?.id) return;
    setDetailLoading(true);
    try {
      const po = await window.electronAPI.getPurchaseOrder?.(detail.id);
      setDetail(po && !po.error ? po : null);
    } finally { setDetailLoading(false); }
    load();
  };

  // Deep links: ?po=<id> opens that PO; ?status=<S> presets the status filter;
  // ?delivery=<D> presets the delivery filter; ?receive=1 opens Receive Items;
  // ?new=1 opens the New PO drawer.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const poId = params.get('po');
    if (poId) openDetail({ id: Number(poId) });
    const status = params.get('status');
    if (status) setStatusFilter(status);
    const delivery = params.get('delivery');
    if (delivery) setDeliveryFilter(delivery.toUpperCase());
    if (poId && params.get('receive') === '1') openReceive({ id: Number(poId) });
    if (params.get('new') === '1') openAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link from Reorder Needed: ?newItem=<productId> opens the New PO drawer
  // with that item pre-selected (nothing is saved automatically).
  const newItemHandled = useRef(false);
  useEffect(() => {
    if (newItemHandled.current || !items.length) return;
    const params = new URLSearchParams(location.search);
    const newItemId = params.get('newItem');
    if (!newItemId) return;
    newItemHandled.current = true;
    const qty = Number(params.get('qty')) || 0;
    const line = makeLine();
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ poDate: moment(), expectedDate: moment().add(7, 'days') });
    setLines([line]);
    setFormOpen(true);
    selectItem(line.key, Number(newItemId));
    if (qty > 0) updateLine(line.key, 'qtyOrdered', qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Create Bill → reuse the existing Enter Bill engine, pre-linked to this PO.
  const createBillFromPO = (po) => {
    setDetailOpen(false);
    history.push(`/main/vendors/bills/enter?po=${po.id}`);
  };

  // Pay Bill → reuse the existing Pay Bills engine (opens its modal for the bill).
  const payBillFromPO = (bill) => {
    history.push(`/main/vendors/bills/pay?bill=${bill.id}`);
  };

  const openReceipt = async (receipt) => {
    try {
      const full = await window.electronAPI.getGoodsReceipt?.(receipt.id);
      setReceiptDetail(full && !full.error ? full : receipt);
    } catch { setReceiptDetail(receipt); }
    setReceiptOpen(true);
  };

  const cancelPo = async (record) => {
    const res = await window.electronAPI.setPurchaseOrderStatus?.(record.id, 'CANCELLED');
    if (res?.success === false) { message.error(res.error || 'Failed'); return; }
    message.success('Purchase Order cancelled'); load();
  };
  const closePo = async (record) => {
    const res = await window.electronAPI.setPurchaseOrderStatus?.(record.id, 'CLOSED');
    if (res?.success === false) { message.error(res.error || 'Failed'); return; }
    message.success('Purchase Order closed'); load();
  };

  const exportCSV = () => {
    const headers = ['po_number', 'vendor_name', 'po_date', 'expected_date', 'total', 'totalReceived', 'totalBilled', 'status'];
    const body = rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `purchase-orders_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const buildPoHtml = (po) => {
    const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');
    const rows = (po.lines || []).map(l => `<tr><td>${esc(l.description)}</td><td style="text-align:right">${Number(l.qty_ordered) || 0}</td><td>${esc(l.unit)}</td><td style="text-align:right">${Number(l.unit_cost || 0).toFixed(2)}</td><td style="text-align:right">${Number(l.tax_rate || 0)}%</td><td style="text-align:right">${Number(l.amount || 0).toFixed(2)}</td></tr>`).join('');
    return `<!doctype html><html><head><title>${esc(po.po_number)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px}h2{margin-bottom:2px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:left}.tot{text-align:right}</style></head><body>
      <h2>Purchase Order ${esc(po.po_number)}</h2>
      <div>Vendor: <strong>${esc(po.vendor_name)}</strong></div>
      <div>PO Date: ${po.po_date ? moment(po.po_date).format('MM/DD/YYYY') : '-'} &nbsp; Expected: ${po.expected_date ? moment(po.expected_date).format('MM/DD/YYYY') : '-'}</div>
      ${po.ship_to ? `<div>Ship To: ${esc(po.ship_to)}</div>` : ''}
      <table><thead><tr><th>Item / Description</th><th>Qty</th><th>Unit</th><th>Cost</th><th>Tax</th><th>Amount</th></tr></thead><tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="5" class="tot">Subtotal</td><td class="tot">${Number(po.subtotal || 0).toFixed(2)}</td></tr>
        <tr><td colspan="5" class="tot">Tax</td><td class="tot">${Number(po.tax_total || 0).toFixed(2)}</td></tr>
        <tr><td colspan="5" class="tot"><strong>Total</strong></td><td class="tot"><strong>${Number(po.total || 0).toFixed(2)}</strong></td></tr>
      </tfoot></table>
      ${po.memo ? `<p>Memo: ${esc(po.memo)}</p>` : ''}
      </body></html>`;
  };

  const handlePrint = async (record) => {
    const po = await window.electronAPI.getPurchaseOrder?.(record.id);
    if (!po) { message.error('Could not load Purchase Order'); return; }
    const w = window.open('', '_blank');
    w.document.open(); w.document.write(buildPoHtml(po)); w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const handleEmailPO = async (record) => {
    const po = await window.electronAPI.getPurchaseOrder?.(record.id);
    if (!po) { message.error('Could not load Purchase Order'); return; }
    const vendor = vendors.find(v => Number(v.id) === Number(po.vendor_id));
    if (!vendor || !vendor.email) { message.warning('This vendor has no email address on file.'); return; }
    try {
      const res = await window.electronAPI.emailSend?.({
        to: vendor.email,
        subject: `Purchase Order ${po.po_number}`,
        body: buildPoHtml(po),
        document_type: 'purchase_order',
        document_id: po.id,
      });
      if (res?.success) message.success(`Purchase Order emailed to ${vendor.email}`);
      else message.error(res?.error || 'Email could not be sent');
    } catch { message.error('Email could not be sent'); }
  };

  const summary = useMemo(() => {
    const open = rows.filter(r => r.status === 'OPEN');
    return {
      open: open.length,
      partiallyReceived: rows.filter(r => r.receivingStatus === 'PARTIALLY_RECEIVED').length,
      awaitingBill: rows.filter(r => r.receivingStatus === 'RECEIVED' && r.billingStatus !== 'BILLED').length,
      openValue: sumMoney(open.map(r => Number(r.total) || 0)),
    };
  }, [rows]);

  // Delivery-status filter (from the ?delivery= deep link / Overdue drill-down).
  const visibleRows = useMemo(
    () => (deliveryFilter ? rows.filter(r => r.deliveryStatus === deliveryFilter) : rows),
    [rows, deliveryFilter]
  );

  const columns = [
    { title: 'PO #', dataIndex: 'po_number', key: 'po_number', width: 110, render: (v, r) => <a onClick={() => openDetail(r)} style={{ fontWeight: 600 }}>{v || `PO-${r.id}`}</a> },
    { title: 'Vendor', dataIndex: 'vendor_name', key: 'vendor_name', ellipsis: true, render: v => v || '-' },
    { title: 'PO Date', dataIndex: 'po_date', key: 'po_date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Expected', dataIndex: 'expected_date', key: 'expected_date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Delivery', key: 'delivery', width: 130, render: (_, r) => {
      const d = r.deliveryStatus;
      if (!d) return <Text type="secondary">—</Text>;
      const label = { OVERDUE: 'Overdue', DUE_TODAY: 'Due Today', EXPECTED: 'Expected', NO_DATE: 'No Date', RECEIVED: 'Received' }[d] || d;
      const color = { OVERDUE: 'red', DUE_TODAY: 'volcano', EXPECTED: 'blue', NO_DATE: 'default', RECEIVED: 'green' }[d] || 'default';
      return <Tag color={color}>{label}</Tag>;
    } },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 120, align: 'right', render: v => <span style={{ fontWeight: 600 }}>{fmtMoney(v)}</span> },
    { title: 'Received', key: 'received', width: 100, align: 'right', render: (_, r) => `${r.totalReceived || 0}/${r.totalOrdered || 0}` },
    { title: 'Billed', key: 'billed', width: 100, align: 'right', render: (_, r) => `${r.totalBilled || 0}/${r.totalOrdered || 0}` },
    { title: 'Status', key: 'status', width: 150, render: (_, r) => <Tag color={statusColor(r.displayStatus)}>{statusLabel(r.displayStatus)}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 170, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="Print"><Button type="text" size="small" icon={<PrinterOutlined />} onClick={() => handlePrint(r)} /></Tooltip>
          {r.status !== 'CANCELLED' && r.status !== 'CLOSED' && (
            <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          )}
          {r.status === 'OPEN' && r.receivingStatus !== 'RECEIVED' && (
            <Tooltip title="Receive Items"><Button type="text" size="small" icon={<InboxOutlined />} style={{ color: '#1890ff' }} onClick={() => openReceive(r)} /></Tooltip>
          )}
          {r.status === 'OPEN' && (
            <Tooltip title="Close"><Button type="text" size="small" icon={<CheckCircleOutlined />} onClick={() => closePo(r)} /></Tooltip>
          )}
          {r.status === 'DRAFT' && (
            <Popconfirm title="Cancel this Purchase Order?" onConfirm={() => cancelPo(r)} okText="Yes" cancelText="No">
              <Tooltip title="Cancel"><Button type="text" size="small" danger icon={<CloseCircleOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg,#1890ff,#69c0ff)' }}><ShoppingCartOutlined /></div>
          <div>
            <Title level={3} style={{ margin: 0 }}>Purchase Orders</Title>
            <Text type="secondary">Manage purchase commitments, receipts and vendor billing</Text>
          </div>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 4px 12px rgba(24,144,255,0.3)', fontWeight: 600 }} onClick={openAdd}>New Purchase Order</Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}><Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #1890ff' }}><Statistic title="Open POs" value={summary.open} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #fa8c16' }}><Statistic title="Partially Received" value={summary.partiallyReceived} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #722ed1' }}><Statistic title="Awaiting Bill" value={summary.awaitingBill} valueStyle={{ color: '#722ed1' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #52c41a' }}><Statistic title="Open Value" value={summary.openValue} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input placeholder="Search PO # or vendor..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} allowClear style={{ width: 240 }}
            value={search} onChange={e => setSearch(e.target.value)} onPressEnter={load} />
          <Select value={statusFilter || 'all'} onChange={v => setStatusFilter(v === 'all' ? '' : v)} style={{ width: 170 }}>
            <Option value="all">All Statuses</Option>
            <Option value="DRAFT">Draft</Option>
            <Option value="OPEN">Open</Option>
            <Option value="PARTIALLY_RECEIVED">Partially Received</Option>
            <Option value="RECEIVED">Received</Option>
            <Option value="BILLED">Billed</Option>
            <Option value="CLOSED">Closed</Option>
            <Option value="CANCELLED">Cancelled</Option>
          </Select>
          <Select value={deliveryFilter || 'all'} onChange={v => setDeliveryFilter(v === 'all' ? '' : v)} style={{ width: 150 }}>
            <Option value="all">All Deliveries</Option>
            <Option value="OVERDUE">Overdue</Option>
            <Option value="DUE_TODAY">Due Today</Option>
            <Option value="EXPECTED">Expected</Option>
            <Option value="NO_DATE">No Date</Option>
          </Select>
          <Select value={vendorFilter || 'all'} onChange={v => setVendorFilter(v === 'all' ? null : v)} style={{ width: 200 }} showSearch optionFilterProp="children">
            <Option value="all">All Vendors</Option>
            {vendors.map(v => <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim()}</Option>)}
          </Select>
          <Tooltip title="Export CSV"><Button icon={<DownloadOutlined />} onClick={exportCSV} /></Tooltip>
          <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={load} /></Tooltip>
        </div>
        <Table columns={columns} dataSource={visibleRows} loading={loading} rowKey="id" size="middle" scroll={{ x: 1150 }}
          pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} purchase orders` }} />
      </Card>

      {/* ── New / Edit PO drawer ── */}
      <Drawer
        className="app-po-drawer"
        title={editing ? `Edit ${editing.po_number || 'Purchase Order'}` : 'New Purchase Order'}
        visible={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); form.resetFields(); setLines([makeLine()]); }}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => { setFormOpen(false); setEditing(null); form.resetFields(); setLines([makeLine()]); }} style={{ marginRight: 8 }}>Cancel</Button>
            <Button loading={saving} onClick={() => handleSave(false)} style={{ marginRight: 8 }}>Save Draft</Button>
            <Button type="primary" loading={saving} onClick={() => handleSave(true)}>Save &amp; Open PO</Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <FormSection title="Purchase Order Details" icon={<ShoppingCartOutlined />}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="vendorId" label="Vendor" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select a vendor' }]}>
                  <Select showSearch optionFilterProp="children" placeholder="Select vendor"
                    onChange={(v) => {
                      const vend = vendors.find(x => Number(x.id) === Number(v));
                      if (vend) form.setFieldsValue({ shipTo: vendorAddress(vend) });
                    }}>
                    {vendors.map(v => <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || v.company_name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="poNumber" label="PO Number" style={FORM_ITEM_STYLE} tooltip="Leave blank to auto-number">
                  <Input placeholder="Auto (PO-0001)" disabled={!!editing} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="poDate" label="PO Date" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'PO date required' }]}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="expectedDate" label="Expected Date" style={FORM_ITEM_STYLE}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="terms" label="Terms" style={FORM_ITEM_STYLE}>
                  <Select placeholder="Select terms">
                    {TERMS_OPTIONS.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="shipTo" label="Ship To" style={FORM_ITEM_STYLE} tooltip="Auto-filled from the selected vendor — you can edit it.">
                  <Input.TextArea rows={2} placeholder="Auto-filled from the vendor" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="memo" label="Memo" style={FORM_ITEM_STYLE}><TextArea rows={2} /></Form.Item>
          </FormSection>

          <FormSection title="Items" icon={<InboxOutlined />}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#fafafa', fontSize: 12 }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', width: '26%' }}>Item</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', width: 90 }}>Qty</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', width: 90 }}>Unit</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', width: 110 }}>Cost</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', width: 90 }}>Tax %</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', width: 130 }}>Warehouse</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', width: 110 }}>Amount</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.key}>
                      <td style={{ padding: '4px 8px' }}>
                        <Select size="small" showSearch allowClear optionFilterProp="children" style={{ width: '100%' }}
                          placeholder="Select item" value={l.itemId} onChange={v => selectItem(l.key, v)}>
                          {purchasableItems.map(it => <Option key={it.id} value={Number(it.id)}>{it.name}{it.sku ? ` (${it.sku})` : ''}</Option>)}
                        </Select>
                        {l.itemType && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{itemTypeLabel(l.itemType)}</div>}
                      </td>
                      <td style={{ padding: '4px 8px' }}><Input size="small" value={l.description} onChange={e => updateLine(l.key, 'description', e.target.value)} /></td>
                      <td style={{ padding: '4px 8px' }}><InputNumber size="small" min={0} style={{ width: '100%' }} value={l.qtyOrdered} onChange={v => updateLine(l.key, 'qtyOrdered', v || 0)} /></td>
                      <td style={{ padding: '4px 8px' }}><Input size="small" value={l.unit} onChange={e => updateLine(l.key, 'unit', e.target.value)} /></td>
                      <td style={{ padding: '4px 8px' }}><InputNumber size="small" min={0} precision={2} style={{ width: '100%' }} value={l.unitCost} onChange={v => updateLine(l.key, 'unitCost', v || 0)} /></td>
                      <td style={{ padding: '4px 8px' }}><InputNumber size="small" min={0} precision={2} style={{ width: '100%' }} value={l.taxRate} onChange={v => updateLine(l.key, 'taxRate', v || 0)} /></td>
                      <td style={{ padding: '4px 8px' }}>
                        <Select size="small" style={{ width: '100%' }} placeholder="Warehouse"
                          value={l.warehouseId != null ? Number(l.warehouseId) : defaultWarehouseId}
                          onChange={v => updateLine(l.key, 'warehouseId', v)}>
                          {warehouses.map(w => <Option key={w.id} value={Number(w.id)}>{w.name}</Option>)}
                        </Select>
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(l.amount)}</td>
                      <td style={{ padding: '4px 8px' }}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(l.key)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 8 }}>Add Line</Button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Subtotal</Text><Text>{fmtMoney(subtotal)}</Text></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Tax</Text><Text>{fmtMoney(taxTotal)}</Text></div>
                <Divider style={{ margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text strong>Total</Text><Text strong style={{ fontSize: 16 }}>{fmtMoney(grandTotal)}</Text></div>
              </div>
            </div>
          </FormSection>
        </Form>
      </Drawer>

      {/* ── Receive Items drawer ── */}
      <Drawer
        className="app-po-drawer"
        title={`Receive Items — ${receivePo?.po_number || ''}`}
        visible={receiveOpen}
        onClose={() => { setReceiveOpen(false); setReceivePo(null); }}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => { setReceiveOpen(false); setReceivePo(null); }} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" icon={<InboxOutlined />} loading={receiving} onClick={handleReceive}>Receive Items</Button>
          </div>
        }
      >
        {receivePo && (
          <Form layout="vertical">
            <FormSection title="Receipt Details" icon={<InboxOutlined />}>
              <Row gutter={16}>
                <Col xs={24} md={8}><Form.Item label="Receipt Date" style={FORM_ITEM_STYLE}><DatePicker style={{ width: '100%' }} value={receiptMeta.receiptDate} onChange={v => setReceiptMeta(m => ({ ...m, receiptDate: v }))} format="MM/DD/YYYY" /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Reference / Packing Slip #" style={FORM_ITEM_STYLE}><Input value={receiptMeta.reference} onChange={e => setReceiptMeta(m => ({ ...m, reference: e.target.value }))} /></Form.Item></Col>
                {warehouses.length > 0 && (
                  <Col xs={24} md={8}>
                    <Form.Item label="Warehouse" style={FORM_ITEM_STYLE}>
                      <Select value={receiptMeta.warehouseId} onChange={v => setReceiptMeta(m => ({ ...m, warehouseId: v }))} options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
                    </Form.Item>
                  </Col>
                )}
              </Row>
              <Form.Item label="Memo" style={FORM_ITEM_STYLE}><TextArea rows={2} value={receiptMeta.memo} onChange={e => setReceiptMeta(m => ({ ...m, memo: e.target.value }))} /></Form.Item>
            </FormSection>
            <FormSection title="Items to Receive" icon={<ShoppingCartOutlined />}>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={receiveLines}
                columns={[
                  { title: 'Item', key: 'item', render: (_, r) => <span>{r.description}{r.itemType ? <div style={{ fontSize: 10, color: '#888' }}>{itemTypeLabel(r.itemType)}</div> : null}</span> },
                  { title: 'Ordered', dataIndex: 'ordered', align: 'right', width: 90 },
                  { title: 'Previously Received', dataIndex: 'previouslyReceived', align: 'right', width: 150 },
                  {
                    title: 'Receive Now', key: 'now', width: 130,
                    render: (_, r) => (
                      <InputNumber size="small" min={0} max={r.tracksInventory ? undefined : 0} style={{ width: '100%' }}
                        value={r.receiveNow} disabled={!r.tracksInventory}
                        onChange={v => setReceiveLines(prev => prev.map(x => x.key === r.key ? { ...x, receiveNow: v || 0 } : x))} />
                    ),
                  },
                  { title: 'Remaining', key: 'rem', align: 'right', width: 110, render: (_, r) => Math.max(0, r.ordered - r.previouslyReceived - (Number(r.receiveNow) || 0)) },
                ]}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Non-inventory and service lines do not move stock and can be skipped. Receive quantities are validated against the remaining amount.
              </Text>
            </FormSection>
          </Form>
        )}
      </Drawer>

      {/* ── PO detail drawer ── */}
      <Drawer
        className="app-po-detail-drawer"
        title={detail ? `${detail.po_number}` : 'Purchase Order'}
        visible={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null); }}
        destroyOnClose
        extra={detail ? (
          <Space>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrint(detail)}>Print</Button>
            <Button size="small" icon={<MailOutlined />} onClick={() => handleEmailPO(detail)}>Email</Button>
            <Dropdown
              trigger={['click']}
              overlay={(
                <Menu>
                  {detail.status !== 'CANCELLED' && detail.status !== 'CLOSED' && (
                    <Menu.Item key="edit" icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detail); }}>Edit PO</Menu.Item>
                  )}
                  <Menu.Item key="vendor" icon={<EyeOutlined />} onClick={() => history.push(`/main/vendors/details/${detail.vendor_id}`)}>View Vendor</Menu.Item>
                  {detail.status === 'OPEN' && (
                    <Menu.Item key="close" icon={<CheckCircleOutlined />} onClick={async () => { await closePo(detail); reloadDetail(); }}>Close PO</Menu.Item>
                  )}
                  {detail.status === 'DRAFT' && (
                    <Menu.Item key="cancel" icon={<CloseCircleOutlined />} danger onClick={async () => { await cancelPo(detail); reloadDetail(); }}>Cancel PO</Menu.Item>
                  )}
                </Menu>
              )}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        ) : null}
      >
        {detailLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : !detail ? (
          <Empty description="Purchase Order not found" />
        ) : (() => {
          const s = detail.summary || {};
          const bills = detail.bills || [];
          const openBill = bills.find(b => Number(b.balance || 0) > 0.005);
          const money = (v) => fmtMoney(v);
          const metric = (label, value, color) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <Text type="secondary">{label}</Text>
              <Text strong style={color ? { color } : undefined}>{value}</Text>
            </div>
          );

          // Context-sensitive primary action.
          let primary = null;
          if (Number(s.outstandingBills || 0) > 0.005 && openBill) {
            primary = <Button type="primary" icon={<DollarOutlined />} onClick={() => payBillFromPO(openBill)}>Pay Bill</Button>;
          } else if (Number(s.remainingToBill || 0) > 0.005) {
            primary = (
              <Space>
                {Number(s.remainingToReceive || 0) > 0.005 && bills.length === 0 && (
                  <Button icon={<InboxOutlined />} onClick={() => openReceive(detail)}>Receive Items</Button>
                )}
                <Button type="primary" icon={<FileTextOutlined />} onClick={() => createBillFromPO(detail)}>Create Bill</Button>
              </Space>
            );
          }

          return (
            <>
              {/* Modern header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.vendor_name || '-'}</div>
                  <Space size={8} wrap style={{ marginTop: 6 }}>
                    <Tag color={statusColor(detail.receivingStatus)}>Receiving: {statusLabel(detail.receivingStatus)}</Tag>
                    <Tag color={statusColor(detail.billingStatus)}>Billing: {statusLabel(detail.billingStatus)}</Tag>
                    <Tag color={statusColor(detail.status)}>{statusLabel(detail.status)}</Tag>
                    {detail.expected_date && <Text type="secondary" style={{ fontSize: 12 }}>Expected {moment(detail.expected_date).format('MMM D, YYYY')}</Text>}
                  </Space>
                </div>
                <Space wrap>{primary}</Space>
              </div>

              {/* Separated summaries: quantities vs money */}
              <Row gutter={12} style={{ marginBottom: 14 }}>
                <Col xs={24} md={12}>
                  <Card size="small" className="al-stat-card" title={<Text strong style={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#667085' }}>Fulfillment (Qty)</Text>}>
                    {metric('Ordered Qty', Number(s.orderedQty || 0))}
                    {metric('Received Qty', Number(s.receivedQty || 0))}
                    {metric('Remaining to Receive', Number(s.remainingToReceive || 0), Number(s.remainingToReceive) > 0 ? '#fa8c16' : undefined)}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" className="al-stat-card" title={<Text strong style={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#667085' }}>Financial</Text>}>
                    {metric('PO Total', money(s.poTotal))}
                    {metric('Billed', money(s.billedAmount))}
                    {metric('Vendor Credits', money(s.creditsApplied))}
                    {metric('Paid', money(s.paidAmount))}
                    {metric('Outstanding Bill Balance', money(s.outstandingBills), Number(s.outstandingBills) > 0 ? '#cf1322' : undefined)}
                    {metric('Remaining to Bill', money(s.remainingToBill), Number(s.remainingToBill) > 0 ? '#fa8c16' : undefined)}
                  </Card>
                </Col>
              </Row>

              {/* Details */}
              <div className="al-po-detail-meta" style={{ border: '1px solid #eef1f5', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon={false}>
                  <Descriptions.Item label={<Text type="secondary">Vendor</Text>}>{detail.vendor_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label={<Text type="secondary">PO Date</Text>}>{detail.po_date ? moment(detail.po_date).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
                  <Descriptions.Item label={<Text type="secondary">Expected</Text>}>{detail.expected_date ? moment(detail.expected_date).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={<Text type="secondary">Remaining to Receive</Text>}>{detail.remainingToReceive != null ? detail.remainingToReceive : '-'}</Descriptions.Item>
              <Descriptions.Item label={<Text type="secondary">Delivery Status</Text>}>
                {detail.deliveryStatus
                  ? <Tag color={{ OVERDUE: 'red', DUE_TODAY: 'volcano', EXPECTED: 'blue', NO_DATE: 'default', RECEIVED: 'green' }[detail.deliveryStatus] || 'default'}>
                      {{ OVERDUE: 'Overdue', DUE_TODAY: 'Due Today', EXPECTED: 'Expected', NO_DATE: 'No Date', RECEIVED: 'Received' }[detail.deliveryStatus] || detail.deliveryStatus}
                    </Tag>
                  : '-'}
              </Descriptions.Item>
                  <Descriptions.Item label={<Text type="secondary">Terms</Text>}>{termsLabel(detail.terms) || '-'}</Descriptions.Item>
                  <Descriptions.Item label={<Text type="secondary">Ship To</Text>} span={2}>{detail.ship_to || '-'}</Descriptions.Item>
                  <Descriptions.Item label={<Text type="secondary">Memo</Text>} span={2}>{detail.memo || '-'}</Descriptions.Item>
                </Descriptions>
              </div>

              <Tabs defaultActiveKey="items">
                <Tabs.TabPane tab="Items" key="items">
                  <Table size="small" rowKey="id" pagination={false} dataSource={detail.lines || []} tableLayout="fixed" scroll={{ x: 720 }}
                    columns={[
                      { title: 'Item / Description', key: 'item', ellipsis: true, render: (_, l) => l.description || `Item #${l.item_id}` },
                      { title: 'Ordered', dataIndex: 'qty_ordered', align: 'right', width: 80 },
                      { title: 'Received', dataIndex: 'qty_received', align: 'right', width: 80 },
                      { title: 'Billed', dataIndex: 'qty_billed', align: 'right', width: 70 },
                      { title: 'Rem. to Receive', key: 'rr', align: 'right', width: 110, render: (_, l) => Math.max(0, (Number(l.qty_ordered) || 0) - (Number(l.qty_received) || 0)) },
                      { title: 'Rem. to Bill', key: 'rb', align: 'right', width: 100, render: (_, l) => Math.max(0, (Number(l.qty_ordered) || 0) - (Number(l.qty_billed) || 0)) },
                      { title: 'Cost', dataIndex: 'unit_cost', align: 'right', width: 100, render: v => money(v) },
                      { title: 'Amount', dataIndex: 'amount', align: 'right', width: 110, render: v => money(v) },
                    ]} />
                </Tabs.TabPane>

                <Tabs.TabPane tab={`Receipts (${(detail.receipts || []).length})`} key="receipts">
                  <Table size="small" rowKey="id" pagination={false} dataSource={detail.receipts || []} tableLayout="fixed"
                    columns={[
                      { title: 'Receipt #', dataIndex: 'receipt_number', width: 130, render: (v, r) => <a onClick={() => openReceipt(r)}>{v || `RCV-${r.id}`}</a> },
                      { title: 'Date', dataIndex: 'receipt_date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                      { title: 'Reference', dataIndex: 'reference', ellipsis: true, render: v => v || '-' },
                      { title: 'Lines', dataIndex: 'line_count', align: 'right', width: 70 },
                      { title: 'Status', key: 'st', width: 100, render: () => <Tag color="cyan">Received</Tag> },
                    ]}
                    locale={{ emptyText: 'No receipts yet.' }} />
                </Tabs.TabPane>

                <Tabs.TabPane tab={`Bills (${bills.length})`} key="bills">
                  {bills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No bills have been created from this purchase order.">
                        <Button type="primary" icon={<FileTextOutlined />} onClick={() => createBillFromPO(detail)}>Create Bill from PO</Button>
                      </Empty>
                    </div>
                  ) : (
                    <Table size="small" rowKey="id" pagination={false} dataSource={bills} tableLayout="fixed" scroll={{ x: 780 }}
                      columns={[
                        { title: 'Bill #', dataIndex: 'ref_no', width: 120, render: (v, r) => <a onClick={() => history.push(`/main/vendors/bills/edit/${r.id}`)}>{v || `#${r.id}`}</a> },
                        { title: 'Bill Date', dataIndex: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                        { title: 'Amount', dataIndex: 'amount', align: 'right', width: 110, render: v => money(v) },
                        { title: 'Paid', dataIndex: 'paid', align: 'right', width: 100, render: v => money(v) },
                        { title: 'Credits', dataIndex: 'credits', align: 'right', width: 100, render: v => money(v) },
                        { title: 'Balance', dataIndex: 'balance', align: 'right', width: 110, render: v => <Text strong style={{ color: Number(v) > 0.005 ? '#cf1322' : '#52c41a' }}>{money(v)}</Text> },
                        { title: 'Status', dataIndex: 'status', width: 120, render: v => <Tag color={String(v || '').toLowerCase() === 'paid' ? 'green' : String(v || '').toLowerCase().includes('partial') ? 'orange' : 'volcano'}>{v || 'Unpaid'}</Tag> },
                        {
                          title: 'Actions', key: 'actions', width: 120, fixed: 'right',
                          render: (_, r) => (
                            <Space size={4}>
                              <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => history.push(`/main/vendors/bills/edit/${r.id}`)} /></Tooltip>
                              {Number(r.balance || 0) > 0.005 && (
                                <Tooltip title="Pay Bill"><Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => payBillFromPO(r)} /></Tooltip>
                              )}
                            </Space>
                          ),
                        },
                      ]} />
                  )}
                </Tabs.TabPane>

                <Tabs.TabPane tab={`Payments (${(detail.payments || []).length})`} key="payments">
                  <Table size="small" rowKey="id" pagination={false} dataSource={detail.payments || []} tableLayout="fixed"
                    columns={[
                      { title: 'Payment #', key: 'no', width: 130, render: (_, p) => <a onClick={() => { if (p.checkId) history.push(`/main/accountant/check-printing?checkId=${p.checkId}`); else history.push(`/main/vendors/bills/edit/${p.billId}`); }}>{`PAY-${String(p.id).padStart(5, '0')}`}</a> },
                      { title: 'Date', dataIndex: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                      { title: 'Bill #', dataIndex: 'billRef', width: 120, render: (v, p) => <a onClick={() => history.push(`/main/vendors/bills/edit/${p.billId}`)}>{v || `#${p.billId}`}</a> },
                      { title: 'Method', key: 'method', width: 100, render: (_, p) => p.checkId ? 'Check' : 'Payment' },
                      { title: 'Bank Account', dataIndex: 'bankName', ellipsis: true, render: v => v || '-' },
                      { title: 'Amount', dataIndex: 'amount', align: 'right', width: 110, render: v => money(v) },
                      { title: 'Status', dataIndex: 'status', width: 100, render: v => <Tag color={String(v || '').toLowerCase() === 'active' ? 'green' : 'default'}>{v || 'Active'}</Tag> },
                    ]}
                    locale={{ emptyText: 'No payments recorded against this purchase order’s bills yet.' }} />
                </Tabs.TabPane>
              </Tabs>
            </>
          );
        })()}
      </Drawer>

      {/* Receipt detail */}
      <Modal
        title={receiptDetail ? `Receipt ${receiptDetail.receipt_number || ''}` : 'Receipt'}
        visible={receiptOpen}
        onCancel={() => { setReceiptOpen(false); setReceiptDetail(null); }}
        footer={<Button onClick={() => { setReceiptOpen(false); setReceiptDetail(null); }}>Close</Button>}
        width={640}
      >
        {receiptDetail && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Date">{receiptDetail.receipt_date ? moment(receiptDetail.receipt_date).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Reference">{receiptDetail.reference || '-'}</Descriptions.Item>
              <Descriptions.Item label="Memo" span={2}>{receiptDetail.memo || '-'}</Descriptions.Item>
            </Descriptions>
            <Table size="small" rowKey="id" pagination={false} dataSource={receiptDetail.lines || []}
              columns={[
                { title: 'Item / Description', key: 'd', render: (_, l) => l.description || `Item #${l.item_id}` },
                { title: 'Qty Received', dataIndex: 'qty_received', align: 'right', width: 120 },
                { title: 'Unit Cost', dataIndex: 'unit_cost', align: 'right', width: 110, render: v => fmtMoney(v) },
              ]}
              locale={{ emptyText: 'No lines.' }} />
          </>
        )}
      </Modal>
    </div>
  );
};

export default PurchaseOrders;
