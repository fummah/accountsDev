import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Select, DatePicker, Tooltip } from 'antd';
import {
  ReloadOutlined, ShoppingCartOutlined, InboxOutlined, WarningOutlined,
  FileTextOutlined, DollarOutlined, PlusOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const PO_STATUS_COLOR = { DRAFT: 'default', OPEN: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'cyan', PARTIALLY_BILLED: 'gold', BILLED: 'green', CLOSED: 'purple', CANCELLED: 'red' };
const DELIVERY_LABEL = { OVERDUE: 'Overdue', DUE_TODAY: 'Due Today', EXPECTED: 'Expected', NO_DATE: 'No Date', RECEIVED: 'Received' };
const DELIVERY_COLOR = { OVERDUE: 'red', DUE_TODAY: 'volcano', EXPECTED: 'blue', NO_DATE: 'default', RECEIVED: 'green' };
const RECEIVING_LABEL = { NOT_RECEIVED: 'Not Received', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received' };
const BILL_STATUS_COLOR = { Unpaid: 'volcano', 'Partially Paid': 'orange', Paid: 'green' };

const PurchasingDashboard = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [deliveries, setDeliveries] = useState(null);
  const [df, setDf] = useState({ status: '', vendorId: null, range: null });

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');
  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadDeliveries = useCallback(async (f = df) => {
    try {
      const fn = window.electronAPI?.getExpectedDeliveries;
      if (!fn) return;
      const res = await fn({
        status: f.status || null,
        vendorId: f.vendorId || null,
        dateFrom: f.range && f.range[0] ? f.range[0].format('YYYY-MM-DD') : null,
        dateTo: f.range && f.range[1] ? f.range[1].format('YYYY-MM-DD') : null,
      });
      setDeliveries(res && !res.error ? res : null);
    } catch { setDeliveries(null); }
  }, [df]);

  const load = useCallback(async (d = days) => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getPurchasingDashboard;
      if (!fn) throw new Error('Purchasing Dashboard is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn({ days: d });
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[purchasing dashboard] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);
  useEffect(() => { loadDeliveries(df); /* eslint-disable-next-line */ }, [df]);

  const s = (data && data.summary) || {};
  const dSummary = (deliveries && deliveries.summary) || {};
  const dItems = (deliveries && deliveries.items) || [];
  const openPO = (id) => history.push(`/main/vendors/purchasing/purchase-orders?po=${id}`);
  const openBill = (id) => history.push(`/main/vendors/bills/edit/${id}`);
  const openVendor = (id) => id != null && history.push(`/main/vendors/details/${id}`);
  const payBill = (b) => history.push(`/main/vendors/bills/pay?bill=${b.billId}`);

  const vendorOptions = useMemo(() => {
    const map = new Map();
    dItems.forEach((p) => { if (p.vendorId != null && p.vendorName) map.set(p.vendorId, p.vendorName); });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [dItems]);

  const cards = [
    { key: 'openPOs', title: 'Open POs', value: s.openPOs, icon: <ShoppingCartOutlined />, color: '#1890ff', onClick: () => history.push('/main/vendors/purchasing/purchase-orders') },
    { key: 'partiallyReceivedPOs', title: 'Partially Received', value: s.partiallyReceivedPOs, icon: <InboxOutlined />, color: '#fa8c16', onClick: () => history.push('/main/vendors/purchasing/purchase-orders') },
    { key: 'overduePOs', title: 'Overdue POs', value: s.overduePOs, icon: <WarningOutlined />, color: '#f5222d', onClick: () => history.push('/main/vendors/purchasing/purchase-orders?delivery=OVERDUE') },
    { key: 'recentlyReceived', title: 'Recently Received', value: s.recentlyReceived, unit: 'receipts', icon: <InboxOutlined />, color: '#722ed1', helper: `Last ${days} days`, onClick: () => history.push('/main/vendors/purchasing/purchase-orders') },
    { key: 'recentlyBilled', title: 'Recently Billed', value: s.recentlyBilled, unit: 'bills', icon: <FileTextOutlined />, color: '#13c2c2', helper: `Last ${days} days`, onClick: () => history.push('/main/vendors/bills/tracker') },
    { key: 'unpaidVendorBills', title: 'Unpaid Vendor Bills', value: s.unpaidVendorBills, icon: <DollarOutlined />, color: '#fa541c', helper: s.unpaidAmount != null ? `${money(s.unpaidAmount)} outstanding` : null, onClick: () => history.push('/main/vendors/bills/tracker') },
  ];

  const attentionColumns = [
    { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => openPO(r.poId)} style={{ fontWeight: 600 }}>{r.poNumber}</a> },
    { title: 'Vendor', key: 'vendor', ellipsis: true, render: (_, r) => r.vendorId != null ? <a onClick={() => openVendor(r.vendorId)}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
    { title: 'PO Date', dataIndex: 'poDate', key: 'poDate', width: 110, render: fmtDate },
    { title: 'Expected', key: 'expected', width: 110, render: (_, r) => r.expectedDate ? fmtDate(r.expectedDate) : <Text type="secondary">—</Text> },
    { title: 'Ordered', dataIndex: 'ordered', key: 'ordered', width: 90, align: 'right' },
    { title: 'Received', dataIndex: 'received', key: 'received', width: 90, align: 'right' },
    { title: 'Remaining', dataIndex: 'remainingToReceive', key: 'remaining', width: 100, align: 'right', render: (v) => <Text strong style={{ color: Number(v) > 0 ? '#fa8c16' : '#8c8c8c' }}>{Number(v)}</Text> },
    { title: 'Billing', dataIndex: 'billingStatus', key: 'billing', width: 140, render: (v) => <Tag color={PO_STATUS_COLOR[v] || 'default'}>{String(v || '').replace(/_/g, ' ')}</Tag> },
    { title: 'Status', key: 'status', width: 120, render: (_, r) => r.overdue ? <Tag color="red">Overdue</Tag> : <Tag color={PO_STATUS_COLOR[r.displayStatus] || 'default'}>{String(r.displayStatus || '').replace(/_/g, ' ')}</Tag> },
  ];

  const deliveryColumns = [
    { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => openPO(r.poId)} style={{ fontWeight: 600 }}>{r.poNumber}</a> },
    { title: 'Vendor', key: 'vendor', ellipsis: true, render: (_, r) => r.vendorId != null ? <a onClick={() => openVendor(r.vendorId)}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
    { title: 'Expected Date', key: 'expected', width: 130, render: (_, r) => r.expectedDate ? fmtDate(r.expectedDate) : <Text type="secondary">—</Text> },
    { title: 'Ordered', dataIndex: 'orderedQty', key: 'ordered', width: 90, align: 'right' },
    { title: 'Received', dataIndex: 'receivedQty', key: 'received', width: 90, align: 'right' },
    { title: 'Remaining', dataIndex: 'remainingQty', key: 'remaining', width: 100, align: 'right', render: (v) => <Text strong style={{ color: '#fa8c16' }}>{Number(v)}</Text> },
    { title: 'Receiving Status', dataIndex: 'receivingStatus', key: 'receiving', width: 160, render: (v) => <Tag color={v === 'PARTIALLY_RECEIVED' ? 'orange' : v === 'RECEIVED' ? 'green' : 'default'}>{RECEIVING_LABEL[v] || v}</Tag> },
    { title: 'Delivery Status', dataIndex: 'deliveryStatus', key: 'delivery', width: 140, render: (v) => <Tag color={DELIVERY_COLOR[v] || 'default'}>{DELIVERY_LABEL[v] || v}</Tag> },
  ];

  const activityColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: fmtDate },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 140, render: (v) => <Tag color={v === 'Receipt' ? 'green' : v === 'Bill' ? 'cyan' : 'blue'}>{v}</Tag> },
    { title: 'Reference', key: 'ref', width: 140, render: (_, r) => {
      if (r.sourceType === 'po') return <a onClick={() => openPO(r.sourceId)}>{r.reference}</a>;
      if (r.sourceType === 'bill') return <a onClick={() => openBill(r.sourceId)}>{r.reference}</a>;
      if (r.sourceType === 'receipt') return <a onClick={() => history.push('/main/vendors/purchasing/purchase-orders')}>{r.reference}</a>;
      return <span>{r.reference}</span>;
    } },
    { title: 'Vendor', key: 'vendor', ellipsis: true, render: (_, r) => r.vendorId != null ? <a onClick={() => openVendor(r.vendorId)}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
    { title: 'Summary', dataIndex: 'summary', key: 'summary', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 130, render: (v) => <Tag>{String(v || '').replace(/_/g, ' ')}</Tag> },
  ];

  const unpaidColumns = [
    { title: 'Vendor', key: 'vendor', ellipsis: true, render: (_, r) => r.vendorId != null ? <a onClick={() => openVendor(r.vendorId)}>{r.vendorName}</a> : <Text>{r.vendorName}</Text> },
    { title: 'Bill #', key: 'bill', width: 140, render: (_, r) => <a onClick={() => openBill(r.billId)} style={{ fontWeight: 600 }}>{r.billNumber}</a> },
    { title: 'Bill Date', dataIndex: 'billDate', key: 'billDate', width: 110, render: fmtDate },
    { title: 'Due Date', key: 'due', width: 110, render: (_, r) => r.dueDate ? fmtDate(r.dueDate) : <Text type="secondary">—</Text> },
    { title: 'Original', dataIndex: 'total', key: 'total', width: 110, align: 'right', render: money },
    { title: 'Credits', dataIndex: 'credits', key: 'credits', width: 100, align: 'right', render: money },
    { title: 'Paid', dataIndex: 'paid', key: 'paid', width: 100, align: 'right', render: money },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 110, align: 'right', render: (v) => <Text strong style={{ color: '#cf1322' }}>{money(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (v) => <Tag color={BILL_STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: '', key: 'action', width: 80, align: 'center', render: (_, r) => <Button size="small" type="primary" onClick={() => payBill(r)}>Pay</Button> },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #1890ff, #69c0ff)' }}><ShoppingCartOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Purchasing</h3>
            <span style={{ color: '#667085' }}>Purchase orders, receiving and vendor billing overview</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>Recent:</Text>
          <Select value={days} onChange={setDays} style={{ width: 140 }} options={[{ value: 7, label: 'Last 7 Days' }, { value: 30, label: 'Last 30 Days' }, { value: 90, label: 'Last 90 Days' }]} />
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={() => { load(days); loadDeliveries(df); }}>Refresh</Button>
          <Button className="gx-btn-primary" icon={<PlusOutlined />} onClick={() => history.push('/main/vendors/purchasing/purchase-orders?new=1')}>New Purchase Order</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load purchasing overview." description={error}
          action={<Button size="small" onClick={() => load(days)}>Retry</Button>} />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={8} key={card.key}>
            <Card hoverable className="al-stat-card" loading={loading} onClick={card.onClick} style={{ cursor: 'pointer', borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>{card.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>{card.value == null ? '—' : Number(card.value).toLocaleString('en-US')}{card.unit ? <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}> {card.unit}</span> : null}</div>
                  {card.helper && <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 2 }}>{card.helper}</div>}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title={<Space><WarningOutlined /> Purchase Orders Requiring Attention</Space>} className="al-stat-card" style={{ marginBottom: 20 }}>
        {!loading && (!data || (data.attentionPOs || []).length === 0) ? <Empty description="No open purchase orders." /> :
          <Table rowKey="poId" size="small" loading={loading} dataSource={(data && data.attentionPOs) || []} columns={attentionColumns} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} />}
      </Card>

      {/* Expected Deliveries — central expected-delivery service */}
      <Card
        className="al-stat-card"
        style={{ marginBottom: 20 }}
        title={<Space><ClockCircleOutlined /> Expected Deliveries
          <Tag color="red">Overdue {dSummary.overdue != null ? dSummary.overdue : '—'}</Tag>
          <Tag color="volcano">Due Today {dSummary.dueToday != null ? dSummary.dueToday : '—'}</Tag>
          <Tag color="blue">Next 7 Days {dSummary.next7Days != null ? dSummary.next7Days : '—'}</Tag>
        </Space>}
        extra={
          <Space wrap size={8}>
            <Select size="small" style={{ width: 150 }} value={df.status || 'all'} onChange={(v) => setDf((f) => ({ ...f, status: v === 'all' ? '' : v }))}>
              <Select.Option value="all">All Statuses</Select.Option>
              <Select.Option value="OVERDUE">Overdue</Select.Option>
              <Select.Option value="DUE_TODAY">Due Today</Select.Option>
              <Select.Option value="EXPECTED">Expected</Select.Option>
              <Select.Option value="NO_DATE">No Date</Select.Option>
            </Select>
            <Select size="small" style={{ width: 170 }} value={df.vendorId || 'all'} onChange={(v) => setDf((f) => ({ ...f, vendorId: v === 'all' ? null : v }))}>
              <Select.Option value="all">All Vendors</Select.Option>
              {vendorOptions.map((v) => <Select.Option key={v.id} value={v.id}>{v.name}</Select.Option>)}
            </Select>
            <RangePicker size="small" value={df.range} onChange={(r) => setDf((f) => ({ ...f, range: r }))} format="MM/DD/YYYY" />
          </Space>
        }
      >
        {!loading && deliveries && dItems.length === 0 ? <Empty description="No expected deliveries match the selected filters." /> :
          <Table rowKey="poId" size="small" loading={loading} dataSource={dItems} columns={deliveryColumns} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} />}
      </Card>

      <Card title={<Space><ReloadOutlined /> Recent Purchasing Activity</Space>} className="al-stat-card" style={{ marginBottom: 20 }}>
        {!loading && (!data || (data.recentActivity || []).length === 0) ? <Empty description="No purchasing activity in the selected period." /> :
          <Table rowKey={(r) => `${r.type}-${r.sourceId}-${r.date}`} size="small" loading={loading} dataSource={(data && data.recentActivity) || []} columns={activityColumns} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} />}
      </Card>

      <Card title={<Space><DollarOutlined /> Unpaid Vendor Bills</Space>} className="al-stat-card">
        {!loading && (!data || (data.unpaidBills || []).length === 0) ? <Empty description="No unpaid vendor bills." /> :
          <Table rowKey="billId" size="small" loading={loading} dataSource={(data && data.unpaidBills) || []} columns={unpaidColumns} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} />}
      </Card>
    </div>
  );
};

export default PurchasingDashboard;
