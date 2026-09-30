import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Select, Input } from 'antd';
import { ReloadOutlined, SearchOutlined, DollarOutlined, RiseOutlined, WarningOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../../utils/currency';
import { typeOptions, itemTypeLabel } from '../../../utils/itemTypes';

const { Text } = Typography;

const STATUS_META = {
  POSITIVE: { label: 'Positive', color: 'green' },
  ZERO: { label: 'Zero', color: 'default' },
  NEGATIVE: { label: 'Negative', color: 'red' },
  ZERO_PRICE: { label: 'No Price', color: 'default' },
  MISSING_COST: { label: 'Missing Cost', color: 'orange' },
  MISSING_PRICE: { label: 'Missing Price', color: 'orange' },
};

const ItemProfitability = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ search: '', type: '', category: '', dataStatus: '' });
  const [categories, setCategories] = useState([]);

  const money = (v) => (v == null ? '—' : `${cSym} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const margin = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`);

  useEffect(() => {
    (async () => {
      try {
        const cats = await window.electronAPI?.getProductCategories?.().catch(() => []);
        setCategories(Array.isArray(cats) ? cats : []);
      } catch { /* optional */ }
    })();
  }, []);

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getItemProfitabilities;
      if (!fn) throw new Error('Item Profitability is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn(f);
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[item profitability] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally { setLoading(false); }
  }, [filters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(filters); }, []);

  const apply = (patch) => { const next = { ...filters, ...patch }; setFilters(next); load(next); };
  const items = (data && data.items) || [];
  const summary = (data && data.summary) || {};

  const cards = [
    { title: 'Items With Profitability', value: summary.withData, icon: <DollarOutlined />, color: '#1890ff' },
    { title: 'Missing Cost', value: summary.missingCost, icon: <WarningOutlined />, color: '#fa8c16' },
    { title: 'Missing Selling Price', value: summary.missingPrice, icon: <WarningOutlined />, color: '#fa541c' },
    { title: 'Negative Margin', value: summary.negative, icon: <RiseOutlined />, color: '#f5222d' },
  ];

  const columns = [
    { title: 'Item', key: 'item', render: (_, r) => <a onClick={() => history.push(`/main/inventory/items?item=${r.itemId}`)} style={{ fontWeight: 600 }}>{r.name}</a>, sorter: (a, b) => (a.name || '').localeCompare(b.name || '') },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Type', key: 'type', width: 150, render: (_, r) => <Tag>{itemTypeLabel(r.type)}</Tag> },
    { title: 'Cost', key: 'cost', width: 110, align: 'right', sorter: (a, b) => (a.cost || 0) - (b.cost || 0), render: (_, r) => r.cost == null ? <Text type="secondary">Not configured</Text> : money(r.cost) },
    { title: 'Selling Price', key: 'price', width: 120, align: 'right', sorter: (a, b) => (a.sellingPrice || 0) - (b.sellingPrice || 0), render: (_, r) => r.sellingPrice == null ? <Text type="secondary">Not configured</Text> : money(r.sellingPrice) },
    { title: 'Gross Profit', key: 'gp', width: 120, align: 'right', sorter: (a, b) => (a.grossProfit || 0) - (b.grossProfit || 0),
      render: (_, r) => r.grossProfit == null ? <Text type="secondary">—</Text> : <Text strong style={{ color: r.grossProfit < 0 ? '#cf1322' : r.grossProfit > 0 ? '#3f8600' : undefined }}>{money(r.grossProfit)}</Text> },
    { title: 'Margin', key: 'margin', width: 110, align: 'right', sorter: (a, b) => (a.marginPercent || 0) - (b.marginPercent || 0),
      render: (_, r) => r.marginPercent == null ? <Text type="secondary">—</Text> : <Text strong style={{ color: r.marginPercent < 0 ? '#cf1322' : '#3f8600' }}>{margin(r.marginPercent)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 130, render: (v) => <Tag color={(STATUS_META[v] || {}).color || 'default'}>{(STATUS_META[v] || {}).label || v}</Tag> },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #52c41a, #95de64)' }}><RiseOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Item Profitability</h3>
            <span style={{ color: '#667085' }}>Current unit gross profit and margin per item (configured cost vs selling price)</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={() => load(filters)}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load Item Profitability." description={error}
          action={<Button size="small" onClick={() => load(filters)}>Retry</Button>} />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card className="al-stat-card" loading={loading} style={{ borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>{card.icon}</div>
                <div>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>{card.value == null ? '—' : Number(card.value).toLocaleString('en-US')}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="al-stat-card" bodyStyle={{ padding: 0 }}>
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input placeholder="Search item or SKU..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} allowClear style={{ width: 240, borderRadius: 8 }}
            value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} onPressEnter={() => apply({})} onClear={() => apply({ search: '' })} />
          <Select style={{ width: 170 }} value={filters.type || 'all'} onChange={(v) => apply({ type: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Types</Select.Option>
            {typeOptions().map((t) => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
          </Select>
          <Select style={{ width: 160 }} value={filters.category || 'all'} onChange={(v) => apply({ category: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Categories</Select.Option>
            {categories.map((c) => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
          </Select>
          <Select style={{ width: 180 }} value={filters.dataStatus || 'all'} onChange={(v) => apply({ dataStatus: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Data</Select.Option>
            <Select.Option value="HAS_DATA">With Profitability</Select.Option>
            <Select.Option value="MISSING_COST">Missing Cost</Select.Option>
            <Select.Option value="MISSING_PRICE">Missing Selling Price</Select.Option>
            <Select.Option value="NEGATIVE">Negative Margin</Select.Option>
          </Select>
        </div>

        {!loading && !error && items.length === 0 ? (
          <div style={{ padding: 40 }}><Empty description="No items match the selected filters." /></div>
        ) : (
          <Table rowKey="itemId" size="middle" loading={loading} dataSource={items} columns={columns}
            pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} items`, style: { margin: 16 } }} />
        )}
      </Card>
    </div>
  );
};

export default ItemProfitability;
