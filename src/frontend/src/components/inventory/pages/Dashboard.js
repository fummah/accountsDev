import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Row, Col, Button, Table, Space, Typography, Empty, Alert, Modal } from 'antd';
import {
  ReloadOutlined, AppstoreOutlined, CheckCircleOutlined, WarningOutlined,
  StopOutlined, ShoppingCartOutlined, InboxOutlined,
  LineChartOutlined, WalletOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import AlertStrip from '../../shared/AlertStrip';

const { Text } = Typography;

const PO_STATUS_LABEL = {
  DRAFT: 'Draft', OPEN: 'Open', PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received', PARTIALLY_BILLED: 'Partially Billed', BILLED: 'Billed',
  CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const PO_STATUS_BADGE = {
  DRAFT: 'grey', OPEN: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'cyan',
  PARTIALLY_BILLED: 'yellow', BILLED: 'green', CLOSED: 'purple', CANCELLED: 'red',
};

// Wieldy badge (matches components/MailNotification/NotificationItem.js).
const GxBadge = ({ color = 'grey', children }) => (
  <span className={`gx-badge gx-text-white gx-badge-${color}`} style={{ margin: 0 }}>{children}</span>
);

// Wieldy-style section header: a tinted icon tile + label.
const SectionTitle = ({ icon, color, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <span style={{
      width: 28, height: 28, borderRadius: 8, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: `${color}1a`, color,
    }}>{icon}</span>
    <span style={{ fontWeight: 600 }}>{children}</span>
  </span>
);

const InventoryDashboard = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyModal, setHistoryModal] = useState({ open: false, itemId: null, itemName: '', loading: false, data: null });

  const attentionRef = useRef(null);
  const incomingRef = useRef(null);
  const activityRef = useRef(null);

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getInventoryDashboard;
      if (!fn) throw new Error('Inventory Dashboard is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn();
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[inventory dashboard] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scrollTo = (ref) => { if (ref && ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const openItemHistory = async (productId, itemName) => {
    setHistoryModal({ open: true, itemId: productId, itemName, loading: true, data: null });
    try {
      const res = await window.electronAPI?.getItemHistory?.(productId, {});
      setHistoryModal((m) => ({ ...m, loading: false, data: res && !res.error ? res : null }));
    } catch {
      setHistoryModal((m) => ({ ...m, loading: false, data: null }));
    }
  };

  const s = (data && data.summary) || {};
  const window = (data && data.window) || 30;

  const cards = [
    { key: 'totalInventoryItems', title: 'Total Inventory Items', value: s.totalInventoryItems, icon: <AppstoreOutlined />, color: '#1890ff', target: 'items' },
    { key: 'inStockItems', title: 'In Stock', value: s.inStockItems, icon: <CheckCircleOutlined />, color: '#52c41a', target: 'attention' },
    { key: 'lowStockItems', title: 'Low Stock', value: s.lowStockItems, icon: <WarningOutlined />, color: '#faad14', target: 'reorder' },
    { key: 'outOfStockItems', title: 'Out of Stock', value: s.outOfStockItems, icon: <StopOutlined />, color: '#f5222d', target: 'reorderOut' },
    { key: 'itemsOnPO', title: 'On Purchase Order', value: s.itemsOnPO, icon: <ShoppingCartOutlined />, color: '#13c2c2', target: 'incoming' },
    { key: 'recentlyReceived', title: 'Recently Received', value: s.recentlyReceived, icon: <InboxOutlined />, color: '#722ed1', target: 'activity', helper: `Last ${window} days` },
    { key: 'recentlySold', title: 'Recently Sold', value: s.recentlySold, icon: <LineChartOutlined />, color: '#eb2f96', target: 'activity', helper: `Last ${window} days` },
    { key: 'inventoryValue', title: 'Inventory Value', value: s.inventoryValue, money: true, icon: <WalletOutlined />, color: '#fa8c16', target: 'attention' },
  ];

  const onCardClick = (card) => {
    if (card.target === 'items') { history.push('/main/inventory/items'); return; }
    if (card.target === 'reorder') { history.push('/main/inventory/reorder'); return; }
    if (card.target === 'reorderOut') { history.push('/main/inventory/reorder?status=OUT_OF_STOCK'); return; }
    if (card.target === 'incoming') { scrollTo(incomingRef); return; }
    if (card.target === 'activity') { scrollTo(activityRef); return; }
    scrollTo(attentionRef);
  };

  const attentionColumns = [
    { title: 'Item', key: 'item', render: (_, r) => (
      <a onClick={() => openItemHistory(r.productId, r.itemName)} style={{ fontWeight: 600 }}>{r.itemName}</a>
    ) },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 100, align: 'right',
      render: (v) => <Text strong style={{ color: Number(v) <= 0 ? '#cf1322' : '#fa8c16' }}>{Number(v)}</Text> },
    { title: 'Reorder Point', dataIndex: 'reorderPoint', key: 'reorderPoint', width: 120, align: 'right' },
    { title: 'On PO', dataIndex: 'onPo', key: 'onPo', width: 90, align: 'right',
      render: (v) => Number(v) > 0 ? <GxBadge color="cyan">+{Number(v)}</GxBadge> : <Text type="secondary">0</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 150,
      render: (v) => <GxBadge color={v === 'Negative Stock' ? 'red' : v === 'Out of Stock' ? 'danger' : 'warning'}>{v}</GxBadge> },
  ];

  const incomingColumns = [
    { title: 'Item', key: 'item', render: (_, r) => (
      <a onClick={() => openItemHistory(r.productId, r.itemName)} style={{ fontWeight: 600 }}>{r.itemName}</a>
    ) },
    { title: 'Vendor', key: 'vendor', render: (_, r) => (
      r.vendorId != null
        ? <a onClick={() => history.push(`/main/vendors/details/${r.vendorId}`)}>{r.vendorName}</a>
        : <Text>{r.vendorName}</Text>
    ) },
    { title: 'PO #', key: 'po', width: 140, render: (_, r) => (
      <a onClick={() => history.push(`/main/vendors/purchasing/purchase-orders?po=${r.poId}`)} style={{ fontWeight: 600 }}>{r.poNumber}</a>
    ) },
    { title: 'Remaining Qty', dataIndex: 'remaining', key: 'remaining', width: 130, align: 'right',
      render: (v) => <Text strong>{Number(v)}</Text> },
    { title: 'Expected Date', dataIndex: 'expectedDate', key: 'expectedDate', width: 130, render: (d) => fmtDate(d) },
    { title: 'PO Status', dataIndex: 'poStatus', key: 'poStatus', width: 160,
      render: (v) => <GxBadge color={PO_STATUS_BADGE[v] || 'grey'}>{PO_STATUS_LABEL[v] || v}</GxBadge> },
  ];

  const activityColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: (d) => fmtDate(d) },
    { title: 'Item', key: 'item', render: (_, r) => (
      r.productId != null
        ? <a onClick={() => openItemHistory(r.productId, r.itemName)}>{r.itemName}</a>
        : <Text>{r.itemName}</Text>
    ) },
    { title: 'Transaction', dataIndex: 'transaction', key: 'transaction', width: 120,
      render: (v) => <GxBadge color={v === 'Receipt' ? 'success' : v === 'Invoice' ? 'blue' : v === 'Bill' ? 'purple' : v === 'Adjustment' ? 'orange' : 'grey'}>{v}</GxBadge> },
    { title: 'Reference', key: 'reference', width: 150, render: (_, r) => {
      if (!r.reference) return <Text type="secondary">—</Text>;
      if (r.sourceType === 'invoice' && r.sourceId != null) return <a onClick={() => history.push(`/main/customers/invoices/edit/${r.sourceId}`)}>{r.reference}</a>;
      if (r.sourceType === 'bill' && r.sourceId != null) return <a onClick={() => history.push(`/main/vendors/bills/edit/${r.sourceId}`)}>{r.reference}</a>;
      if (r.sourceType === 'receipt' && r.sourceId != null) return <a onClick={() => history.push('/main/vendors/purchasing/purchase-orders')}>{r.reference}</a>;
      return <Text>{r.reference}</Text>;
    } },
    { title: 'Qty In', dataIndex: 'qtyIn', key: 'qtyIn', width: 90, align: 'right',
      render: (v) => Number(v) > 0 ? <Text style={{ color: '#52c41a' }}>+{Number(v)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Qty Out', dataIndex: 'qtyOut', key: 'qtyOut', width: 90, align: 'right',
      render: (v) => Number(v) > 0 ? <Text style={{ color: '#cf1322' }}>-{Number(v)}</Text> : <Text type="secondary">—</Text> },
  ];

  const historyRows = (historyModal.data && historyModal.data.rows) || [];
  const historyColumns = [
    { title: 'Date', dataIndex: 'movedAt', key: 'date', width: 120, render: (d) => fmtDate(d) },
    { title: 'Transaction', key: 'txn', render: (_, r) => r.sourceLabel || r.source || r.reason || 'Movement' },
    { title: 'Reference', key: 'ref', render: (_, r) => r.source || '—' },
    { title: 'Qty In', key: 'in', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) > 0 ? <Text style={{ color: '#52c41a' }}>+{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Qty Out', key: 'out', width: 90, align: 'right', render: (_, r) => Number(r.quantityChange) < 0 ? <Text style={{ color: '#cf1322' }}>{Number(r.quantityChange)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 100, align: 'right' },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #13c2c2, #5cdbd3)' }}><AppstoreOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Inventory</h3>
            <span style={{ color: '#667085' }}>Simple stock, purchasing and movement overview</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-primary" icon={<AppstoreOutlined />} onClick={() => history.push('/main/inventory/items')}>View Items</Button>
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load inventory summary."
          description={error}
          action={<Button size="small" onClick={load}>Retry</Button>}
        />
      )}

      {/* Stat cards — modern Wieldy-style layout, colors on the border + icon tile */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.key}>
            <Card
              hoverable
              className="al-stat-card"
              loading={loading}
              onClick={() => onCardClick(card)}
              bodyStyle={{ padding: 16 }}
              style={{
                cursor: 'pointer',
                border: `1px solid ${card.color}33`,
                borderTop: `3px solid ${card.color}`,
                borderRadius: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, color: '#fff',
                    background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)`,
                    boxShadow: `0 4px 10px ${card.color}40`,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2d3d', lineHeight: 1.15 }}>
                    {card.money
                      ? `${cSym} ${Number(card.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : Number(card.value || 0).toLocaleString('en-US')}
                  </div>
                  {card.helper && <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 2 }}>{card.helper}</div>}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Operational alerts — counts from the central inventoryAlertsService */}
      <AlertStrip alerts={data && data.alerts} only={['lowStock', 'outOfStock']} title="Inventory Alerts" />

      {/* Stock Attention */}
      <div ref={attentionRef} style={{ marginBottom: 20 }}>
        <Card title={<SectionTitle icon={<WarningOutlined />} color="#faad14">Stock Attention</SectionTitle>} className="al-stat-card">
          {!loading && (!data || (data.stockAttention || []).length === 0) ? (
            <Empty description="No low-stock items. Inventory levels are currently above their reorder points." />
          ) : (
            <Table
              rowKey="productId"
              size="small"
              loading={loading}
              dataSource={(data && data.stockAttention) || []}
              columns={attentionColumns}
              pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
            />
          )}
        </Card>
      </div>

      {/* Incoming Stock */}
      <div ref={incomingRef} style={{ marginBottom: 20 }}>
        <Card title={<SectionTitle icon={<InboxOutlined />} color="#13c2c2">Incoming Stock</SectionTitle>} className="al-stat-card">
          {!loading && (!data || (data.incomingStock || []).length === 0) ? (
            <Empty description="No incoming inventory. There are no open purchase-order quantities." />
          ) : (
            <Table
              rowKey={(r) => `${r.poId}-${r.productId}-${r.remaining}`}
              size="small"
              loading={loading}
              dataSource={(data && data.incomingStock) || []}
              columns={incomingColumns}
              pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
            />
          )}
        </Card>
      </div>

      {/* Recent Inventory Activity */}
      <div ref={activityRef}>
        <Card title={<SectionTitle icon={<HistoryOutlined />} color="#722ed1">Recent Inventory Activity <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>Last {window} days</Text></SectionTitle>} className="al-stat-card">
          {!loading && (!data || (data.recentActivity || []).length === 0) ? (
            <Empty description="No recent inventory activity." />
          ) : (
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={(data && data.recentActivity) || []}
              columns={activityColumns}
              pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
            />
          )}
        </Card>
      </div>

      <Modal
        title={historyModal.itemName ? `Inventory History — ${historyModal.itemName}` : 'Inventory History'}
        visible={historyModal.open}
        onCancel={() => setHistoryModal({ open: false, itemId: null, itemName: '', loading: false, data: null })}
        footer={null}
        width={820}
        destroyOnClose
      >
        <Table
          rowKey={(r) => r.id}
          size="small"
          loading={historyModal.loading}
          dataSource={historyRows}
          columns={historyColumns}
          pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No inventory movements for this item." /> }}
        />
      </Modal>
    </div>
  );
};

export default InventoryDashboard;
