import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Table, Space, Typography, Empty, Alert, Tabs, Tag, DatePicker, Row, Col } from 'antd';
import { ReloadOutlined, FileSearchOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography;

const PO_STATUS_COLOR = { DRAFT: 'default', OPEN: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'cyan', PARTIALLY_BILLED: 'gold', BILLED: 'green', CLOSED: 'purple', CANCELLED: 'red' };

const PurchasingReports = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState(null);
  const [tab, setTab] = useState('items');

  const fmtDate = (d) => (d ? moment(d).format('MM/DD/YYYY') : '—');
  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async (r = range) => {
    setLoading(true); setError(null);
    try {
      const fn = window.electronAPI?.getPurchasingReports;
      if (!fn) throw new Error('Purchasing Reports are unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn({
        dateFrom: r && r[0] ? r[0].format('YYYY-MM-DD') : null,
        dateTo: r && r[1] ? r[1].format('YYYY-MM-DD') : null,
      });
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[purchasing reports] load failed:', e);
      setError(e?.message || String(e)); setData(null);
    } finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(range); /* eslint-disable-next-line */ }, [range]);

  const openPO = (id) => history.push(`/main/vendors/purchasing/purchase-orders?po=${id}`);

  const itemsColumns = [
    { title: 'Item', key: 'item', render: (_, r) => r.productId ? <a onClick={() => history.push(`/main/inventory/items?item=${r.productId}`)}>{r.name}</a> : <Text>{r.name}</Text> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Qty Purchased', dataIndex: 'quantity', key: 'qty', width: 140, align: 'right', render: (v) => <Text strong>{Number(v)}</Text> },
    { title: 'Avg Unit Cost', dataIndex: 'avgUnitCost', key: 'avg', width: 150, align: 'right', render: money },
    { title: 'Total Value', dataIndex: 'value', key: 'value', width: 160, align: 'right', render: (v) => <Text strong>{money(v)}</Text> },
  ];
  const rvoColumns = [
    { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => openPO(r.poId)} style={{ fontWeight: 600 }}>{r.poNumber}</a> },
    { title: 'Vendor', dataIndex: 'vendorName', key: 'vendor', ellipsis: true },
    { title: 'Line', key: 'line', ellipsis: true, render: (_, r) => r.description || `Line ${r.lineNo}` },
    { title: 'Ordered', dataIndex: 'ordered', key: 'ordered', width: 100, align: 'right' },
    { title: 'Received', dataIndex: 'received', key: 'received', width: 100, align: 'right' },
    { title: 'Remaining', dataIndex: 'remaining', key: 'remaining', width: 110, align: 'right', render: (v) => <Text strong style={{ color: Number(v) > 0 ? '#fa8c16' : '#8c8c8c' }}>{Number(v)}</Text> },
    { title: 'Billed', dataIndex: 'billed', key: 'billed', width: 100, align: 'right' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 130, render: (v) => <Tag color={PO_STATUS_COLOR[v] || 'default'}>{String(v || '').replace(/_/g, ' ')}</Tag> },
  ];
  const poColumns = [
    { title: 'PO #', key: 'po', width: 130, render: (_, r) => <a onClick={() => openPO(r.id)} style={{ fontWeight: 600 }}>{r.po_number || `PO-${r.id}`}</a> },
    { title: 'Vendor', dataIndex: 'vendor_name', key: 'vendor', ellipsis: true, render: (v) => v || '—' },
    { title: 'Expected', dataIndex: 'expected_date', key: 'exp', width: 120, render: fmtDate },
    { title: 'Ordered', key: 'ordered', width: 100, align: 'right', render: (_, r) => Number(r.totalOrdered || 0) },
    { title: 'Received', key: 'received', width: 100, align: 'right', render: (_, r) => Number(r.totalReceived || 0) },
    { title: 'Remaining', key: 'rem', width: 110, align: 'right', render: (_, r) => <Text strong style={{ color: Number(r.remainingToReceive) > 0 ? '#fa8c16' : '#8c8c8c' }}>{Number(r.remainingToReceive || 0)}</Text> },
    { title: 'Status', dataIndex: 'displayStatus', key: 'status', width: 150, render: (v) => <Tag color={PO_STATUS_COLOR[v] || 'default'}>{String(v || '').replace(/_/g, ' ')}</Tag> },
  ];

  const tabBody = (rows, columns, empty) => (
    !loading && (!rows || rows.length === 0)
      ? <Empty description={empty} />
      : <Table rowKey={(r) => `${r.itemId || r.lineId || r.id}-${r.poId || ''}`} size="small" loading={loading} dataSource={rows || []} columns={columns} pagination={{ defaultPageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} rows` }} scroll={{ x: 900 }} />
  );

  const ip = (data && data.itemsPurchased) || {};
  const rvo = (data && data.receivedVsOrdered) || {};
  const open = (data && data.openPurchaseOrders) || {};
  const out = (data && data.outstandingPurchaseOrders) || {};

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #1890ff, #69c0ff)' }}><FileSearchOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Purchasing Reports</h3>
            <span style={{ color: '#667085' }}>Items purchased, received vs ordered, and open/outstanding POs</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center" wrap>
          <DatePicker.RangePicker value={range} onChange={setRange} format="MM/DD/YYYY" />
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={() => load(range)}>Refresh</Button>
        </Space>
      </div>

      {error && <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }} message="Unable to load purchasing reports." description={error} action={<Button size="small" onClick={() => load(range)}>Retry</Button>} />}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><Card size="small" className="al-stat-card"><Text type="secondary">Items Purchased</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{ip.count == null ? '—' : ip.count}</div></Card></Col>
        <Col xs={12} lg={6}><Card size="small" className="al-stat-card"><Text type="secondary">Purchased Value</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{ip.total == null ? '—' : money(ip.total)}</div></Card></Col>
        <Col xs={12} lg={6}><Card size="small" className="al-stat-card"><Text type="secondary">Open POs</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{open.count == null ? '—' : open.count}</div></Card></Col>
        <Col xs={12} lg={6}><Card size="small" className="al-stat-card"><Text type="secondary">Outstanding POs</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{out.count == null ? '—' : out.count}</div></Card></Col>
      </Row>

      <Card className="al-stat-card">
        <Tabs activeKey={tab} onChange={setTab}>
          <Tabs.TabPane tab="Items Purchased" key="items">{tabBody(ip.rows, itemsColumns, 'No items purchased in the selected period.')}</Tabs.TabPane>
          <Tabs.TabPane tab="Received vs Ordered" key="rvo">{tabBody(rvo.rows, rvoColumns, 'No purchase-order lines to compare.')}</Tabs.TabPane>
          <Tabs.TabPane tab="Open POs" key="open">{tabBody(open.rows, poColumns, 'No open purchase orders.')}</Tabs.TabPane>
          <Tabs.TabPane tab="Outstanding POs" key="out">{tabBody(out.rows, poColumns, 'No outstanding purchase orders.')}</Tabs.TabPane>
        </Tabs>
      </Card>

      <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
        Inventory Movement and Low Stock reports reuse their dedicated screens (Inventory → Movement Report / Inventory Alerts); Vendor Purchase History is on each Vendor detail page.
      </div>
    </div>
  );
};

export default PurchasingReports;
