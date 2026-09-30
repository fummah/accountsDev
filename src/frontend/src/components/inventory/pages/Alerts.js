import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Select, Input, Tooltip } from 'antd';
import {
  ReloadOutlined, SearchOutlined, WarningOutlined, StopOutlined,
  ClockCircleOutlined, InboxOutlined, FileExclamationOutlined, BellOutlined,
} from '@ant-design/icons';
import { useHistory, useLocation } from 'react-router-dom';
import moment from 'moment';

const { Text } = Typography;

const TYPE_META = {
  LOW_STOCK: { label: 'Low Stock', color: 'orange', icon: <WarningOutlined /> },
  OUT_OF_STOCK: { label: 'Out of Stock', color: 'red', icon: <StopOutlined /> },
  PO_OVERDUE: { label: 'PO Overdue', color: 'volcano', icon: <ClockCircleOutlined /> },
  PARTIAL_RECEIPT: { label: 'Partial Receipt', color: 'blue', icon: <InboxOutlined /> },
  BILL_RECEIPT_MISMATCH: { label: 'Bill Qty > Received', color: 'magenta', icon: <FileExclamationOutlined /> },
};

const SEVERITY_COLOR = { critical: 'red', warning: 'orange', info: 'blue' };
const SEVERITY_LABEL = { critical: 'High', warning: 'Warning', info: 'Info' };

const Alerts = () => {
  const history = useHistory();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ type: '', category: '', search: '' });

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getInventoryAlerts;
      if (!fn) throw new Error('Inventory Alerts are unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn(f);
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[inventory alerts] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Deep link: ?type=LOW_STOCK presets the alert-type filter.
  useEffect(() => {
    const type = new URLSearchParams(location.search).get('type');
    const next = { type: type || '', category: '', search: '' };
    setFilters(next);
    load(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const apply = (patch) => { const next = { ...filters, ...patch }; setFilters(next); load(next); };

  const summary = (data && data.summary) || {};
  const alerts = (data && data.alerts) || [];

  const cards = [
    { key: 'lowStock', title: 'Low Stock', value: summary.lowStock, color: '#faad14', icon: <WarningOutlined />, onClick: () => history.push('/main/inventory/reorder') },
    { key: 'outOfStock', title: 'Out of Stock', value: summary.outOfStock, color: '#f5222d', icon: <StopOutlined />, onClick: () => history.push('/main/inventory/items?stockStatus=OUT_OF_STOCK') },
    { key: 'poOverdue', title: 'Overdue POs', value: summary.poOverdue, color: '#fa541c', icon: <ClockCircleOutlined />, onClick: () => history.push('/main/vendors/purchasing/purchase-orders?delivery=OVERDUE') },
    { key: 'partialReceipt', title: 'Partial Receipts', value: summary.partialReceipt, color: '#1890ff', icon: <InboxOutlined />, onClick: () => history.push('/main/vendors/purchasing/purchase-orders?status=PARTIALLY_RECEIVED') },
    { key: 'billReceiptMismatch', title: 'Bill / Receipt Mismatch', value: summary.billReceiptMismatch, color: '#eb2f96', icon: <FileExclamationOutlined />, onClick: () => apply({ type: 'BILL_RECEIPT_MISMATCH', category: '' }) },
  ];

  const entityCell = (r) => {
    if (r.entityType === 'ITEM') {
      return <a onClick={() => history.push(r.action.route)} style={{ fontWeight: 600 }}>{r.meta.name}</a>;
    }
    if (r.entityType === 'PURCHASE_ORDER') {
      return <a onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.meta.poId}`)} style={{ fontWeight: 600 }}>{r.meta.poNumber}</a>;
    }
    if (r.entityType === 'BILL') {
      return r.meta.billId
        ? <a onClick={() => history.push(`/main/vendors/bills/edit/${r.meta.billId}`)} style={{ fontWeight: 600 }}>{r.meta.billNumber}</a>
        : <a onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.meta.poId}`)} style={{ fontWeight: 600 }}>{r.meta.poNumber}</a>;
    }
    return <Text>{r.title}</Text>;
  };

  const actionsCell = (r) => {
    const btns = [];
    if (r.entityType === 'ITEM') {
      btns.push(<Button key="item" size="small" type="primary" ghost onClick={() => history.push(r.action.route)}>View Item</Button>);
      if (r.type === 'LOW_STOCK') btns.push(<Button key="reorder" size="small" onClick={() => history.push('/main/inventory/reorder')}>View Reorder</Button>);
    } else if (r.entityType === 'PURCHASE_ORDER') {
      btns.push(<Button key="po" size="small" type="primary" ghost onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.meta.poId}`)}>View PO</Button>);
      if (r.type === 'PARTIAL_RECEIPT') btns.push(<Button key="recv" size="small" onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.meta.poId}&receive=1`)}>Receive Items</Button>);
    } else if (r.entityType === 'BILL') {
      if (r.meta.billId) btns.push(<Button key="bill" size="small" type="primary" ghost onClick={() => history.push(`/main/vendors/bills/edit/${r.meta.billId}`)}>View Bill</Button>);
      btns.push(<Button key="po" size="small" onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.meta.poId}`)}>View PO</Button>);
    }
    return <Space size={4} wrap>{btns}</Space>;
  };

  const columns = [
    { title: 'Type', key: 'type', width: 170, render: (_, r) => {
      const m = TYPE_META[r.type] || {};
      return <Space size={6}><Tag color={m.color} icon={m.icon}>{m.label || r.type}</Tag></Space>;
    } },
    { title: 'Item / Document', key: 'entity', width: 180, render: (_, r) => entityCell(r) },
    { title: 'Details', key: 'details', render: (_, r) => <Text>{r.message}</Text> },
    { title: 'Date', key: 'date', width: 110, render: (_, r) => <Text type={r.date ? undefined : 'secondary'}>{fmtDate(r.date)}</Text> },
    { title: 'Status', key: 'status', width: 200, render: (_, r) => (
      <Space size={4} wrap>
        <Tag color={SEVERITY_COLOR[r.severity] || 'default'}>{SEVERITY_LABEL[r.severity] || r.severity}</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.status}</Text>
      </Space>
    ) },
    { title: 'Action', key: 'action', width: 230, render: (_, r) => actionsCell(r) },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #fa541c, #ff7a45)' }}><BellOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Inventory Alerts</h3>
            <span style={{ color: '#667085' }}>Current inventory and purchasing exceptions</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={() => load(filters)}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load inventory alerts." description={error}
          action={<Button size="small" onClick={() => load(filters)}>Retry</Button>} />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={8} xl={4} key={card.key} style={{ flex: '1 1 0' }}>
            <Card hoverable className="al-stat-card" loading={loading} onClick={card.onClick}
              style={{ cursor: 'pointer', borderTop: `3px solid ${card.color}`, borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>{card.icon}</div>
                <div style={{ minWidth: 0 }}>
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
          <Input placeholder="Search item, PO, bill or vendor..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} allowClear style={{ width: 280, borderRadius: 8 }}
            value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} onPressEnter={() => apply({})} onClear={() => apply({ search: '' })} />
          <Select style={{ width: 200 }} value={filters.type || 'all'} onChange={(v) => apply({ type: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Alerts</Select.Option>
            <Select.Option value="LOW_STOCK">Low Stock</Select.Option>
            <Select.Option value="OUT_OF_STOCK">Out of Stock</Select.Option>
            <Select.Option value="PO_OVERDUE">PO Overdue</Select.Option>
            <Select.Option value="PARTIAL_RECEIPT">Partial Receipt</Select.Option>
            <Select.Option value="BILL_RECEIPT_MISMATCH">Bill / Receipt Mismatch</Select.Option>
          </Select>
          <Select style={{ width: 170 }} value={filters.category || 'all'} onChange={(v) => apply({ category: v === 'all' ? '' : v })}>
            <Select.Option value="all">All Categories</Select.Option>
            <Select.Option value="INVENTORY">Inventory</Select.Option>
            <Select.Option value="PURCHASING">Purchasing</Select.Option>
            <Select.Option value="BILLING">Billing Mismatch</Select.Option>
          </Select>
          <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={() => load(filters)} /></Tooltip>
        </div>

        {!loading && !error && alerts.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description="No inventory or purchasing alerts require attention." />
          </div>
        ) : (
          <Table rowKey="id" size="middle" loading={loading} dataSource={alerts} columns={columns} scroll={{ x: 1000 }}
            pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} alerts`, style: { margin: 16 } }} />
        )}
      </Card>
    </div>
  );
};

export default Alerts;
