import React, { useEffect, useState, useCallback } from 'react';
import { Card, Descriptions, Button, Tabs, Table, Tag, Empty, Spin, Typography, Alert } from 'antd';
import { ReloadOutlined, ShoppingCartOutlined, InboxOutlined, FileTextOutlined, DollarOutlined, WalletOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { formatPhone } from '../../utils/phone';
import { useCurrency } from '../../utils/currency';

const { Text } = Typography;

/**
 * VendorDetailsContent — THE single Vendor detail implementation.
 *
 * Used by BOTH:
 *   • VendorDetails (page shell)            — PO → View Vendor
 *   • SupplierVendorList (wide drawer shell) — Suppliers/Vendors → View
 *
 * It owns all vendor data loading (vendor info, Purchasing Summary, Vendor
 * Activity) through the SAME electron APIs. Only the outer shell differs, so the
 * two entry points can never drift. `onNavigate` lets a drawer close itself
 * before routing; `onVendorLoaded` lets a shell show the vendor name.
 */
const VendorDetailsContent = ({ vendorId, mode = 'page', onNavigate, onVendorLoaded }) => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [vendor, setVendor] = useState(null);
  const [vendorError, setVendorError] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');

  const id = vendorId != null ? Number(vendorId) : null;
  const nav = onNavigate || ((path) => history.push(path));

  const loadVendor = useCallback(async (vid) => {
    setVendor(null);
    setVendorError(null);
    try {
      const res = await window.electronAPI?.getSingleSupplier?.(Number(vid));
      if (!res || res.error) throw new Error((res && res.error) || 'Vendor not found');
      setVendor(res);
      if (onVendorLoaded) onVendorLoaded(res);
    } catch (e) {
      console.error('[vendor details] vendor load failed:', e);
      setVendorError(e?.message || String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivity = useCallback(async (vid) => {
    setActivityLoading(true);
    setActivity(null);
    try {
      const res = await window.electronAPI?.getVendorActivity?.(Number(vid));
      setActivity(res && !res.error ? res : { purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] });
    } catch { setActivity({ purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] }); }
    finally { setActivityLoading(false); }
  }, []);

  const loadSummary = useCallback(async (vid) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const fn = window.electronAPI?.getVendorPurchasingSummary;
      if (!fn) throw new Error('Vendor Purchasing Summary is unavailable in this build.');
      const res = await fn(Number(vid));
      if (!res || res.error) throw new Error((res && res.error) || 'No data returned');
      setSummary(res);
    } catch (e) {
      console.error('[vendor summary] load failed:', e);
      setSummaryError(e?.message || String(e));
      setSummary(null);
    } finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    if (!id) return;
    setActiveTab('pos');
    loadVendor(id); loadActivity(id); loadSummary(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (vendorError) {
    return (
      <Alert
        type="error" showIcon style={{ borderRadius: 8 }}
        message="Unable to load vendor details." description={vendorError}
        action={<Button size="small" onClick={() => loadVendor(id)}>Retry</Button>}
      />
    );
  }
  if (!vendor) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="Loading vendor..." /></div>;
  }

  const fullAddr = [vendor.address1, vendor.address2, vendor.city, vendor.state, vendor.postal_code, vendor.country].filter(Boolean).join(', ');
  const a = activity || { purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] };
  const s = summary || {};

  const summaryCards = [
    { key: 'openPurchaseOrders', label: 'Open Purchase Orders', data: s.openPurchaseOrders, icon: <ShoppingCartOutlined />, color: '#1890ff', tab: 'pos' },
    { key: 'received', label: 'Received', data: s.received, icon: <InboxOutlined />, color: '#13c2c2', tab: 'receipts' },
    { key: 'bills', label: 'Billed', data: s.bills, icon: <FileTextOutlined />, color: '#722ed1', tab: 'bills' },
    { key: 'paid', label: 'Paid', data: s.paid, icon: <DollarOutlined />, color: '#52c41a', tab: 'payments' },
    { key: 'outstanding', label: 'Outstanding', data: s.outstanding, icon: <WalletOutlined />, color: '#fa541c', tab: 'bills' },
  ];

  const tabTable = (dataSource, columns, emptyText) => (
    <Table size="small" rowKey="id" dataSource={dataSource || []} columns={columns} pagination={{ pageSize: 10 }}
      locale={{ emptyText }} scroll={{ x: 640 }} />
  );

  return (
    <>
      <Descriptions className="gx-vendor-info" column={{ xs: 1, sm: 1, md: 2 }} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Name" span={2}>{vendor.display_name || `${vendor.first_name || ''} ${vendor.last_name || ''}`.trim()}</Descriptions.Item>
        <Descriptions.Item label="Company">{vendor.company_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Email">{vendor.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Phone">{formatPhone(vendor.phone_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{formatPhone(vendor.mobile_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Fax">{vendor.fax || '-'}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{fullAddr || '-'}</Descriptions.Item>
        <Descriptions.Item label="Opening Balance">{money(vendor.opening_balance)}</Descriptions.Item>
        <Descriptions.Item label="Due Amount">{money(vendor.due_amount ? vendor.due_amount.due_amount : 0)}</Descriptions.Item>
        <Descriptions.Item label="Notes" span={2}>{vendor.notes || '-'}</Descriptions.Item>
      </Descriptions>

      {/* ── Purchasing Summary (central service) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong>Purchasing Summary</strong>
        <Button size="small" icon={<ReloadOutlined />} loading={summaryLoading} onClick={() => loadSummary(id)}>Refresh</Button>
      </div>
      {summaryError && (
        <Alert type="error" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
          message="Unable to load Vendor Purchasing Summary." description={summaryError}
          action={<Button size="small" onClick={() => loadSummary(id)}>Retry</Button>} />
      )}
      <div className="gx-vendor-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 8 }}>
        {summaryCards.map((card) => (
          <Card key={card.key} hoverable className="al-stat-card" loading={summaryLoading} style={{ cursor: 'pointer', borderTop: `3px solid ${card.color}`, borderRadius: 12 }}
            onClick={() => setActiveTab(card.tab)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>{card.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#667085', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2d3d' }}>{summaryLoading || !card.data ? '—' : money(card.data.amount)}</div>
                {card.data && card.data.count != null && (
                  <div style={{ fontSize: 11, color: '#98a2b3' }}>{card.key === 'outstanding' ? `${card.data.billCount} bill(s)` : `${card.data.count} record(s)`}</div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {s.credits && s.credits.availableAmount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Available Vendor Credits: {money(s.credits.availableAmount)}</Text>
        </div>
      )}

      {/* ── Vendor Activity ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 8 }}>
        <strong>Vendor Activity</strong>
        <Button size="small" icon={<ReloadOutlined />} loading={activityLoading} onClick={() => loadActivity(id)}>Refresh</Button>
      </div>

      {activityLoading && !activity ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Loading vendor activity..." /></div>
      ) : (
        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ width: '100%' }}>
          <Tabs.TabPane tab={`Purchase Orders (${a.purchaseOrders.length})`} key="pos">
            {tabTable(a.purchaseOrders, [
              { title: 'PO #', dataIndex: 'po_number', render: (v, r) => <a onClick={() => nav(`/main/vendors/purchasing/purchase-orders?po=${r.id}`)}>{v || `PO-${r.id}`}</a> },
              { title: 'Date', dataIndex: 'po_date', render: (v) => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Total', dataIndex: 'total', align: 'right', render: (v) => money(v) },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag>{v || 'DRAFT'}</Tag> },
            ], 'No purchase orders.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Receipts (${a.receipts.length})`} key="receipts">
            {tabTable(a.receipts, [
              { title: 'Receipt #', dataIndex: 'receipt_number' },
              { title: 'Date', dataIndex: 'receipt_date', render: (v) => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Reference', dataIndex: 'reference', render: (v) => v || '-' },
            ], 'No receipts.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Bills (${a.bills.length})`} key="bills">
            {tabTable(a.bills, [
              { title: 'Bill', dataIndex: 'ref_no', render: (v, r) => <a onClick={() => nav(`/main/vendors/bills/edit/${r.id}`)}>{v || `#${r.id}`}</a> },
              { title: 'Date', dataIndex: 'date', render: (v) => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag>{v || '-'}</Tag> },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => money(v) },
            ], 'No bills.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Payments (${a.payments.length})`} key="payments">
            {tabTable(a.payments, [
              { title: 'Date', dataIndex: 'date', render: (v) => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Bill', dataIndex: 'ref_no', render: (v, r) => <a onClick={() => nav(`/main/vendors/bills/edit/${r.expense_id}`)}>{v || `#${r.expense_id}`}</a> },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => money(v) },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={String(v || '').toLowerCase() === 'active' ? 'green' : 'default'}>{v || 'Active'}</Tag> },
            ], 'No payments.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Credits (${a.credits.length})`} key="credits">
            {tabTable(a.credits, [
              { title: 'Date', dataIndex: 'date', render: (v) => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Reference', dataIndex: 'reference', render: (v) => v || '-' },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => money(v) },
              { title: 'Remaining', dataIndex: 'remaining_amount', align: 'right', render: (v) => money(v) },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag>{v || 'Active'}</Tag> },
            ], 'No vendor credits.')}
          </Tabs.TabPane>
        </Tabs>
      )}
      {!activityLoading && !a.purchaseOrders.length && !a.receipts.length && !a.bills.length && !a.payments.length && !a.credits.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No purchasing activity for this Vendor yet." style={{ marginTop: 8 }} />
      )}
    </>
  );
};

export default VendorDetailsContent;
