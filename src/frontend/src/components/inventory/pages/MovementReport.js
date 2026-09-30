import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Select, Input, DatePicker, Modal, Tooltip } from 'antd';
import {
  ReloadOutlined, PrinterOutlined, DownloadOutlined, SearchOutlined,
  HistoryOutlined, AppstoreOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { normalizeTypeCode } from '../../../utils/itemTypes';
import { toCsv, downloadCsv } from '../../../utils/csv';
import { printHtml, PRINT_BASE_CSS } from '../../../utils/printDocument';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const TX_OPTIONS = [
  { value: 'BEGINNING', label: 'Beginning Inventory' },
  { value: 'RECEIPT', label: 'Purchase Receipt' },
  { value: 'BILL', label: 'Bill Receipt' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'ADJUSTMENT', label: 'Inventory Adjustment' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'MOVEMENT', label: 'Movement' },
];
const TX_COLOR = { BEGINNING: 'purple', RECEIPT: 'green', BILL: 'cyan', INVOICE: 'blue', ADJUSTMENT: 'orange', TRANSFER: 'geekblue', MOVEMENT: 'default' };

const MovementReport = () => {
  const history = useHistory();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [historyModal, setHistoryModal] = useState({ open: false, itemName: '', loading: false, rows: [] });

  const defaultRange = [moment().startOf('month'), moment().endOf('month')];
  const [range, setRange] = useState(defaultRange);
  const [itemId, setItemId] = useState(null);
  const [txType, setTxType] = useState('');
  const [reference, setReference] = useState('');
  const [warehouseId, setWarehouseId] = useState(null);

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');

  useEffect(() => {
    (async () => {
      try {
        const [prods, whs] = await Promise.all([
          window.electronAPI?.getAllProducts?.().catch(() => []),
          window.electronAPI?.getWarehouses?.().catch(() => []),
        ]);
        const list = Array.isArray(prods) ? prods : (prods?.data || []);
        setItems(list.filter((p) => normalizeTypeCode(p.type) === 'INVENTORY_PART'));
        setWarehouses(Array.isArray(whs) ? whs : []);
      } catch { /* lookups optional */ }
    })();
  }, []);

  const buildParams = useCallback((over = {}) => ({
    dateFrom: range && range[0] ? range[0].format('YYYY-MM-DD') : null,
    dateTo: range && range[1] ? range[1].format('YYYY-MM-DD') : null,
    itemId, transactionType: txType || null, reference: reference || null, warehouseId,
    page, pageSize, ...over,
  }), [range, itemId, txType, reference, warehouseId, page, pageSize]);

  const load = useCallback(async (over = {}) => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getInventoryMovementReport;
      if (!fn) throw new Error('Inventory Movement Report is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn(buildParams(over));
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[movement report] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize]);

  const apply = () => { setPage(1); load({ page: 1 }); };
  const reset = () => {
    setRange(defaultRange); setItemId(null); setTxType(''); setReference(''); setWarehouseId(null);
    setPage(1);
    load({ dateFrom: defaultRange[0].format('YYYY-MM-DD'), dateTo: defaultRange[1].format('YYYY-MM-DD'), itemId: null, transactionType: null, reference: null, warehouseId: null, page: 1 });
  };

  const rows = (data && data.rows) || [];
  const summary = (data && data.summary) || {};
  const total = (data && data.total) || 0;

  const openHistory = async (r) => {
    setHistoryModal({ open: true, itemName: r.itemName, loading: true, rows: [] });
    try {
      const res = await window.electronAPI?.getItemHistory?.(r.productId, {});
      setHistoryModal({ open: true, itemName: r.itemName, loading: false, rows: (res && res.rows) || [] });
    } catch {
      setHistoryModal({ open: true, itemName: r.itemName, loading: false, rows: [] });
    }
  };

  const openReference = (r) => {
    if (r.sourceType === 'invoice' && r.sourceId != null) { history.push(`/main/customers/invoices/edit/${r.sourceId}`); return; }
    if (r.sourceType === 'bill' && r.sourceId != null) { history.push(`/main/vendors/bills/edit/${r.sourceId}`); return; }
    if (r.sourceType === 'receipt' && r.sourceId != null) { history.push('/main/vendors/purchasing/purchase-orders'); return; }
    // Adjustments/transfers have no routed detail page.
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: (d) => fmtDate(d) },
    { title: 'Item', key: 'item', render: (_, r) => <a onClick={() => openHistory(r)} style={{ fontWeight: 600 }}>{r.itemName}</a> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Transaction', key: 'txn', width: 170, render: (_, r) => (
      <Space size={4} wrap>
        <Tag color={TX_COLOR[r.transactionType] || 'default'} style={{ borderRadius: 20, padding: '1px 10px' }}>{r.transactionLabel}</Tag>
        {r.reason && <Text type="secondary" style={{ fontSize: 11 }}>{r.reason}</Text>}
      </Space>
    ) },
    { title: 'Reference', key: 'ref', width: 150, render: (_, r) => {
      if (!r.reference) return <Text type="secondary">—</Text>;
      const clickable = (r.sourceType === 'invoice' || r.sourceType === 'bill' || r.sourceType === 'receipt') && r.sourceId != null;
      return clickable ? <a onClick={() => openReference(r)}>{r.reference}</a> : <span>{r.reference}</span>;
    } },
    { title: 'Qty', dataIndex: 'signedQty', key: 'qty', width: 90, align: 'right',
      render: (v) => Number(v) >= 0 ? <Text style={{ color: '#52c41a', fontWeight: 600 }}>+{Number(v)}</Text> : <Text style={{ color: '#cf1322', fontWeight: 600 }}>{Number(v)}</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 100, align: 'right', render: (v) => <Text strong>{Number(v)}</Text> },
  ];

  const historyColumns = [
    { title: 'Date', dataIndex: 'movedAt', key: 'date', width: 120, render: (d) => fmtDate(d) },
    { title: 'Transaction', key: 'txn', render: (_, r) => r.sourceLabel || r.source || r.reason || 'Movement' },
    { title: 'Qty In', key: 'in', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) > 0 ? <Text style={{ color: '#52c41a' }}>+{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Qty Out', key: 'out', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) < 0 ? <Text style={{ color: '#cf1322' }}>{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 100, align: 'right' },
  ];

  const filterText = () => [
    range && range[0] ? `${range[0].format('MM/DD/YYYY')} – ${range[1].format('MM/DD/YYYY')}` : 'All dates',
    itemId ? (items.find((i) => Number(i.id) === Number(itemId))?.name || 'Item') : 'All Inventory Items',
    txType ? (TX_OPTIONS.find((t) => t.value === txType)?.label || txType) : 'All Transaction Types',
    reference ? `Reference contains "${reference}"` : null,
    warehouseId ? (warehouses.find((w) => Number(w.id) === Number(warehouseId))?.name || 'Warehouse') : null,
  ].filter(Boolean);

  const fetchAll = () => window.electronAPI.getInventoryMovementReport(buildParams({ page: 1, pageSize, all: true }));

  const exportCsv = async () => {
    try {
      const res = await fetchAll();
      const all = (res && res.rows) || [];
      const csv = toCsv(
        ['Date', 'Item', 'SKU', 'Transaction', 'Reference', 'Qty In', 'Qty Out', 'Qty', 'Balance', 'Warehouse'],
        all.map((r) => [fmtDate(r.date), r.itemName, r.sku, r.transactionLabel, r.reference, r.qtyIn, r.qtyOut, r.signedQty, r.balance, r.warehouseName])
      );
      downloadCsv(`inventory-movement-${moment().format('YYYY-MM-DD')}.csv`, csv);
    } catch (e) { console.error('[movement report] export failed:', e); }
  };

  const printReport = async () => {
    try {
      const [res, company] = await Promise.all([fetchAll(), window.electronAPI?.getCompany?.().catch(() => null)]);
      const all = (res && res.rows) || [];
      const s = (res && res.summary) || {};
      const companyName = (company && (company.company_name || company.name)) || 'AccuLedger';
      const rowsHtml = all.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.itemName}</td><td>${r.sku || ''}</td><td>${r.transactionLabel}</td><td>${r.reference || ''}</td><td class="num">${r.signedQty > 0 ? '+' : ''}${r.signedQty}</td><td class="num">${r.balance}</td></tr>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_BASE_CSS}
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1f2d3d}
        h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f5f5f5} .num{text-align:right}
        .meta{margin:12px 0;font-size:12px;color:#444}
      </style></head><body>
        <h1>${companyName}</h1>
        <div class="sub">Inventory Movement Report</div>
        <div class="meta">${filterText().join(' &middot; ')}<br/>Generated ${moment().format('MM/DD/YYYY HH:mm')}</div>
        <div class="meta">Items Moved: ${s.itemsMoved || 0} &middot; Qty In: ${s.totalQtyIn || 0} &middot; Qty Out: ${s.totalQtyOut || 0} &middot; Net: ${s.netMovement || 0}</div>
        <table><thead><tr><th>Date</th><th>Item</th><th>SKU</th><th>Transaction</th><th>Reference</th><th class="num">Qty</th><th class="num">Balance</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`;
      if (!printHtml(html)) console.error('[movement report] print blocked');
    } catch (e) { console.error('[movement report] print failed:', e); }
  };

  const cards = [
    { title: 'Items Moved', value: summary.itemsMoved, icon: <AppstoreOutlined />, color: '#1890ff' },
    { title: 'Qty In', value: summary.totalQtyIn, icon: <ArrowDownOutlined />, color: '#52c41a' },
    { title: 'Qty Out', value: summary.totalQtyOut, icon: <ArrowUpOutlined />, color: '#f5222d' },
    { title: 'Net Movement', value: summary.netMovement, icon: <SwapOutlined />, color: '#722ed1', signed: true },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #13c2c2, #5cdbd3)' }}><SwapOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Inventory Movement</h3>
            <span style={{ color: '#667085' }}>View inventory quantity changes and trace each movement to its source.</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-warning" icon={<PrinterOutlined />} onClick={printReport}>Print</Button>
          <Button className="gx-btn-info" icon={<DownloadOutlined />} onClick={exportCsv}>Export</Button>
          <Button className="gx-btn-primary" icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load Inventory Movement Report." description={error}
          action={<Button size="small" onClick={() => load()}>Retry</Button>} />
      )}

      <Card className="al-stat-card" style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Space wrap size={12} align="center">
          <RangePicker value={range} onChange={(r) => setRange(r)} format="MM/DD/YYYY" allowClear={false} />
          <Select style={{ width: 220 }} value={itemId} onChange={setItemId} allowClear showSearch optionFilterProp="children" placeholder="All Items">
            {items.map((i) => <Select.Option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</Select.Option>)}
          </Select>
          <Select style={{ width: 190 }} value={txType || undefined} onChange={(v) => setTxType(v || '')} allowClear placeholder="All Transaction Types">
            {TX_OPTIONS.map((t) => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
          </Select>
          <Input style={{ width: 180 }} placeholder="Reference (e.g. INV-2031)" prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} value={reference}
            onChange={(e) => setReference(e.target.value)} onPressEnter={apply} allowClear />
          {warehouses.length > 0 && (
            <Select style={{ width: 170 }} value={warehouseId} onChange={setWarehouseId} allowClear placeholder="All Warehouses">
              {warehouses.map((w) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          )}
          <Button type="primary" className="gx-btn-primary" onClick={apply}>Apply</Button>
          <Button onClick={reset}>Reset</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card className="al-stat-card" loading={loading} style={{ borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
                  {card.icon}
                </div>
                <div>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>
                    {card.value == null ? '—' : `${card.signed && Number(card.value) > 0 ? '+' : ''}${Number(card.value).toLocaleString('en-US')}`}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="al-stat-card" bodyStyle={{ padding: 0 }}>
        {!loading && !error && rows.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description="No inventory movements found for the selected filters.">
              <Button onClick={reset}>Reset Filters</Button>
            </Empty>
          </div>
        ) : (
          <Table rowKey="movementId" size="middle" loading={loading} dataSource={rows} columns={columns}
            pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '250'], showTotal: (t) => `${t} movements`, onChange: (p, ps) => { setPage(p); setPageSize(ps); }, style: { margin: 16 } }} />
        )}
      </Card>

      <Modal title={historyModal.itemName ? `Inventory History — ${historyModal.itemName}` : 'Inventory History'}
        visible={historyModal.open} onCancel={() => setHistoryModal({ open: false, itemName: '', loading: false, rows: [] })} footer={null} width={820} destroyOnClose>
        <Table rowKey={(r) => r.id} size="small" loading={historyModal.loading} dataSource={historyModal.rows} columns={historyColumns}
          pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty description="No inventory movements for this item." /> }} />
      </Modal>
    </div>
  );
};

export default MovementReport;
