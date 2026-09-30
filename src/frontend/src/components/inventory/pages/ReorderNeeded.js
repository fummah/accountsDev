import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Select, Input, Modal, Tooltip } from 'antd';
import {
  ReloadOutlined, ShoppingCartOutlined, WarningOutlined, InboxOutlined,
  StopOutlined, DollarOutlined, SearchOutlined, HistoryOutlined, EyeOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useHistory, useLocation } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography;

const STATUS_LABEL = {
  NEEDS_ORDERING: 'Needs Ordering',
  ON_ORDER: 'On Order',
  OUT_OF_STOCK: 'Out of Stock',
  OUT_OF_STOCK_ON_ORDER: 'Out of Stock — On Order',
};
const STATUS_COLOR = {
  NEEDS_ORDERING: 'orange',
  ON_ORDER: 'blue',
  OUT_OF_STOCK: 'red',
  OUT_OF_STOCK_ON_ORDER: 'volcano',
};

const ReorderNeeded = () => {
  const history = useHistory();
  const location = useLocation();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', category: '', vendorId: null });
  const [historyModal, setHistoryModal] = useState({ open: false, itemName: '', loading: false, rows: [] });
  const [onPoModal, setOnPoModal] = useState({ open: false, itemName: '', loading: false, lines: [] });

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');
  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getReorderNeeded;
      if (!fn) throw new Error('Reorder Needed is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn(f);
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[reorder needed] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const s = new URLSearchParams(location.search).get('status');
    const init = { search: '', status: s || '', category: '', vendorId: null };
    setFilters(init);
    load(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = (patch) => { const next = { ...filters, ...patch }; setFilters(next); load(next); };

  const items = (data && data.items) || [];
  const summary = (data && data.summary) || {};

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items]);
  const vendors = useMemo(() => {
    const map = new Map();
    items.forEach((i) => { if (i.preferredVendorId != null && i.preferredVendorName) map.set(i.preferredVendorId, i.preferredVendorName); });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const openHistory = async (item) => {
    setHistoryModal({ open: true, itemName: item.name, loading: true, rows: [] });
    try {
      const res = await window.electronAPI?.getItemHistory?.(item.productId, {});
      setHistoryModal({ open: true, itemName: item.name, loading: false, rows: (res && res.rows) || [] });
    } catch {
      setHistoryModal({ open: true, itemName: item.name, loading: false, rows: [] });
    }
  };

  const openOnPo = async (item) => {
    setOnPoModal({ open: true, itemName: item.name, loading: true, lines: [] });
    try {
      const lines = await window.electronAPI?.getOnPoLines?.(item.productId);
      setOnPoModal({ open: true, itemName: item.name, loading: false, lines: Array.isArray(lines) ? lines : [] });
    } catch {
      setOnPoModal({ open: true, itemName: item.name, loading: false, lines: [] });
    }
  };

  const createPo = (item) => {
    // Reuse the existing New Purchase Order flow (drawer). Nothing is saved
    // automatically; the user reviews Vendor / Qty / Cost / Date.
    // Suggested quantity = MAX(Reorder Point - Expected, 0) (overridable).
    history.push(`/main/vendors/purchasing/purchase-orders?newItem=${item.productId}&qty=${item.shortfall || ''}`);
  };

  const cards = [
    { key: 'needsOrdering', title: 'Needs Ordering', value: summary.needsOrdering, icon: <WarningOutlined />, color: '#fa8c16' },
    { key: 'onOrder', title: 'Already on PO', value: summary.onOrder, icon: <InboxOutlined />, color: '#1890ff' },
    { key: 'outOfStock', title: 'Out of Stock', value: summary.outOfStock, icon: <StopOutlined />, color: '#f5222d' },
    { key: 'totalShortfall', title: 'Total Shortfall', value: summary.totalShortfall, icon: <DollarOutlined />, color: '#722ed1', unit: 'units' },
  ];

  const columns = [
    { title: 'Item', key: 'item', render: (_, r) => <a onClick={() => openHistory(r)} style={{ fontWeight: 600 }}>{r.name}</a> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 90, align: 'right',
      render: (v) => <Text strong style={{ color: Number(v) <= 0 ? '#cf1322' : '#fa8c16' }}>{Number(v)}</Text> },
    { title: 'Reorder Point', dataIndex: 'reorderPoint', key: 'rp', width: 120, align: 'right' },
    { title: 'On PO', dataIndex: 'onPurchaseOrder', key: 'onPo', width: 90, align: 'right',
      render: (v, r) => Number(v) > 0 ? <a onClick={() => openOnPo(r)} style={{ fontWeight: 600, color: '#13c2c2' }}>{Number(v)}</a> : <Text type="secondary">0</Text> },
    { title: 'Expected', dataIndex: 'expected', key: 'expected', width: 90, align: 'right',
      render: (v) => <Tooltip title="Expected = On Hand + On PO"><span>{Number(v)}</span></Tooltip> },
    { title: 'Preferred Vendor', key: 'vendor', width: 170, ellipsis: true,
      render: (_, r) => r.preferredVendorName ? <Tooltip title={r.preferredVendorName}><span>{r.preferredVendorName}</span></Tooltip> : <Text type="secondary">—</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 170,
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'} style={{ borderRadius: 20, padding: '1px 10px' }}>{STATUS_LABEL[v] || v}</Tag> },
    { title: '', key: 'action', width: 110, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View inventory history"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => openHistory(r)} /></Tooltip>
          <Tooltip title="Create Purchase Order"><Button size="small" type="text" style={{ color: '#1890ff' }} icon={<PlusOutlined />} onClick={() => createPo(r)} /></Tooltip>
        </Space>
      ) },
  ];

  const historyColumns = [
    { title: 'Date', dataIndex: 'movedAt', key: 'date', width: 120, render: (d) => fmtDate(d) },
    { title: 'Transaction', key: 'txn', render: (_, r) => r.sourceLabel || r.source || r.reason || 'Movement' },
    { title: 'Qty In', key: 'in', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) > 0 ? <Text style={{ color: '#52c41a' }}>+{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Qty Out', key: 'out', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) < 0 ? <Text style={{ color: '#cf1322' }}>{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 100, align: 'right' },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #fa8c16, #ffc53d)' }}><WarningOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Reorder Needed</h3>
            <span style={{ color: '#667085' }}>Inventory items at or below their reorder point</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={() => load(filters)}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load reorder information." description={error}
          action={<Button size="small" onClick={() => load(filters)}>Retry</Button>} />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.key}>
            <Card className="al-stat-card" loading={loading} style={{ borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
                  {card.icon}
                </div>
                <div>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>
                    {card.value == null ? '—' : `${Number(card.value).toLocaleString('en-US')}${card.unit ? ` ${card.unit}` : ''}`}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="al-stat-card" bodyStyle={{ padding: 0 }}>
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input placeholder="Search item, SKU or vendor..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} allowClear
            style={{ width: 240, borderRadius: 8 }} value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            onPressEnter={() => applyFilter({})}
            onClear={() => applyFilter({ search: '' })} />
          <Select value={filters.status || 'all'} style={{ width: 170, borderRadius: 8 }}
            onChange={(v) => applyFilter({ status: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Statuses</Select.Option>
            <Select.Option value="NEEDS_ORDERING">Needs Ordering</Select.Option>
            <Select.Option value="ON_ORDER">On Order</Select.Option>
            <Select.Option value="OUT_OF_STOCK">Out of Stock</Select.Option>
          </Select>
          <Select value={filters.category || 'all'} style={{ width: 160, borderRadius: 8 }}
            onChange={(v) => applyFilter({ category: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Categories</Select.Option>
            {categories.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
          </Select>
          <Select value={filters.vendorId || 'all'} style={{ width: 180, borderRadius: 8 }}
            onChange={(v) => applyFilter({ vendorId: v === 'all' ? null : v })}>
            <Select.Option value="all">All Vendors</Select.Option>
            {vendors.map((v) => <Select.Option key={v.id} value={v.id}>{v.name}</Select.Option>)}
          </Select>
        </div>

        {!loading && !error && items.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description="No items currently need reorder attention. Inventory levels are above their configured reorder points." />
          </div>
        ) : (
          <Table rowKey="productId" size="middle" loading={loading} dataSource={items} columns={columns}
            pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} items`, style: { margin: 16 } }} />
        )}
      </Card>

      <Modal title={historyModal.itemName ? `Inventory History — ${historyModal.itemName}` : 'Inventory History'}
        visible={historyModal.open} onCancel={() => setHistoryModal({ open: false, itemName: '', loading: false, rows: [] })} footer={null} width={820} destroyOnClose>
        <Table rowKey={(r) => r.id} size="small" loading={historyModal.loading} dataSource={historyModal.rows} columns={historyColumns}
          pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty description="No inventory movements for this item." /> }} />
      </Modal>

      <Modal title={onPoModal.itemName ? `On Purchase Order — ${onPoModal.itemName}` : 'On Purchase Order'}
        visible={onPoModal.open} onCancel={() => setOnPoModal({ open: false, itemName: '', loading: false, lines: [] })} footer={null} width={760} destroyOnClose>
        <Table rowKey={(r) => `${r.poId}-${r.remaining}-${r.poNumber}`} size="small" loading={onPoModal.loading} dataSource={onPoModal.lines} pagination={false}
          locale={{ emptyText: <Empty description="No open purchase orders for this item." /> }}
          columns={[
            { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => { setOnPoModal({ open: false, itemName: '', loading: false, lines: [] }); history.push(`/main/vendors/purchasing/purchase-orders?po=${r.poId}`); }} style={{ fontWeight: 600 }}>{r.poNumber}</a> },
            { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendorId != null ? <a onClick={() => { setOnPoModal({ open: false, itemName: '', loading: false, lines: [] }); history.push(`/main/vendors/details/${r.vendorId}`); }}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
            { title: 'Ordered', dataIndex: 'qtyOrdered', key: 'o', width: 90, align: 'right' },
            { title: 'Received', dataIndex: 'qtyReceived', key: 'r', width: 90, align: 'right' },
            { title: 'Remaining', dataIndex: 'remaining', key: 'rem', width: 100, align: 'right', render: (v) => <Text strong style={{ color: '#13c2c2' }}>{Number(v)}</Text> },
            { title: 'Expected Date', dataIndex: 'expectedDate', key: 'exp', width: 120, render: (d) => fmtDate(d) },
          ]}
        />
      </Modal>
    </div>
  );
};

export default ReorderNeeded;
