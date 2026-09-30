import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Table, Tag, Space, Typography, Empty, Alert, Tooltip } from 'antd';
import { ReloadOutlined, ReconciliationOutlined, CheckCircleOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography;

const IntegrityTag = ({ type }) => {
  const map = {
    QOH_MOVEMENT_MISMATCH: { color: 'red', label: 'QOH ≠ movements' },
    ZERO_QTY_NONZERO_VALUE: { color: 'volcano', label: 'Value with no qty' },
    NO_COST_BASIS: { color: 'orange', label: 'No cost basis' },
    MISSING_INVENTORY_ASSET_ACCOUNT: { color: 'magenta', label: 'Missing asset account' },
    NO_ITEM_LINK: { color: 'red', label: 'Not linked to stock item' },
  };
  const m = map[type] || { color: 'default', label: type };
  return <Tag color={m.color}>{m.label}</Tag>;
};

const InventoryReconciliation = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = window.electronAPI?.getInventoryReconciliation;
      if (!fn) throw new Error('Inventory Reconciliation is unavailable — restart the app so the latest backend (preload) loads.');
      const res = await fn();
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setData(res);
    } catch (e) {
      console.error('[inventory reconciliation] load failed:', e);
      setError(e?.message || String(e));
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = (data && data.summary) || {};
  const totals = (data && data.totals) || {};
  const accounts = (data && data.accounts) || [];
  const integrity = (data && data.integrity) || [];

  const cards = [
    { title: 'Accounts Balanced', value: s.accountsBalanced, icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Out of Balance', value: s.accountsOutOfBalance, icon: <ExclamationCircleOutlined />, color: s.accountsOutOfBalance ? '#f5222d' : '#8c8c8c' },
    { title: 'Total Difference', value: money(totals.difference), icon: <WarningOutlined />, color: Math.abs(Number(totals.difference) || 0) > 0.005 ? '#fa541c' : '#52c41a' },
    { title: 'Integrity Issues', value: s.integrityIssues, icon: <WarningOutlined />, color: s.integrityIssues ? '#fa8c16' : '#8c8c8c' },
  ];

  const accountColumns = [
    { title: 'Inventory Asset Account', dataIndex: 'accountName', key: 'account', render: (v) => <Text strong>{v}</Text> },
    { title: 'Items', dataIndex: 'itemCount', key: 'items', width: 80, align: 'right' },
    { title: 'Subledger Value', dataIndex: 'subledgerValue', key: 'sub', width: 160, align: 'right', render: money },
    { title: 'GL Balance', dataIndex: 'glBalance', key: 'gl', width: 160, align: 'right', render: money },
    { title: 'Difference', dataIndex: 'difference', key: 'diff', width: 150, align: 'right',
      render: (v) => <Text strong style={{ color: Math.abs(Number(v)) < 0.005 ? '#3f8600' : '#cf1322' }}>{money(v)}</Text> },
    { title: 'Status', key: 'status', width: 120,
      render: (_, r) => r.balanced ? <Tag color="green">Balanced</Tag> : <Tag color="red">Difference</Tag> },
  ];

  const integrityColumns = [
    { title: 'Issue', dataIndex: 'type', key: 'type', width: 200, render: (v) => <IntegrityTag type={v} /> },
    { title: 'Item', key: 'item', render: (_, r) => r.productId ? <a onClick={() => history.push(`/main/inventory/items?item=${r.productId}`)}>{r.name}</a> : <Text>{r.name}</Text> },
    { title: 'Detail', dataIndex: 'detail', key: 'detail' },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #2f54eb, #85a5ff)' }}><ReconciliationOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Inventory Reconciliation</h3>
            <span style={{ color: '#667085' }}>Inventory subledger vs Inventory Asset GL — by account</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message="Unable to load inventory reconciliation." description={error}
          action={<Button size="small" onClick={load}>Retry</Button>} />
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 10 }}
        message="Read-only diagnostic"
        description="AccuLedger capitalises inventory at the vendor Bill (Receipt moves quantity and valuation layers). A difference here is information for review — it is never auto-corrected with a plug journal. Causes include received-not-yet-billed stock, manual GL entries to Inventory Asset, a missing movement, or an item pointing at the wrong account."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card className="al-stat-card" loading={loading} style={{ borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>{card.icon}</div>
                <div>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>{card.value == null ? '—' : card.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="al-stat-card" title="Reconciliation by Inventory Asset Account" style={{ marginBottom: 20 }}>
        {!loading && accounts.length === 0 ? <Empty description="No inventory accounts to reconcile." /> : (
          <Table
            rowKey={(r) => String(r.accountId)}
            size="small"
            loading={loading}
            dataSource={accounts}
            columns={accountColumns}
            pagination={false}
            expandable={{
              expandedRowRender: (r) => (
                <Table
                  rowKey="productId"
                  size="small"
                  dataSource={r.items || []}
                  columns={[
                    { title: 'Item', key: 'item', render: (_, x) => <a onClick={() => history.push(`/main/inventory/items?item=${x.productId}`)}>{x.name}</a> },
                    { title: 'Subledger Value', dataIndex: 'value', key: 'v', align: 'right', width: 180, render: money },
                  ]}
                  pagination={false}
                  locale={{ emptyText: 'No item value in this account.' }}
                />
              ),
              rowExpandable: (r) => (r.items || []).length > 0,
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '12px 8px 0', color: '#667085' }}>
          <span>Subledger total: <Text strong>{money(totals.subledgerValue)}</Text></span>
          <span>GL total: <Text strong>{money(totals.glBalance)}</Text></span>
          <span>Difference: <Text strong style={{ color: Math.abs(Number(totals.difference) || 0) < 0.005 ? '#3f8600' : '#cf1322' }}>{money(totals.difference)}</Text></span>
        </div>
      </Card>

      <Card className="al-stat-card" title={<Space><WarningOutlined /> Data Integrity Checks</Space>}>
        {!loading && integrity.length === 0 ? <Empty description="No inventory integrity issues detected." /> : (
          <Table rowKey={(r) => `${r.type}-${r.productId}`} size="small" loading={loading} dataSource={integrity} columns={integrityColumns} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} />
        )}
      </Card>
    </div>
  );
};

export default InventoryReconciliation;
