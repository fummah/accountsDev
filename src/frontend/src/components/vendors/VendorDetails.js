import React, { useEffect, useState } from 'react';
import { Card, Descriptions, message, Button, Tabs, Table, Tag, Empty, Spin } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams, useHistory } from 'react-router-dom';
import moment from 'moment';
import { formatPhone } from '../../utils/phone';
import { useCurrency } from '../../utils/currency';

const VendorDetails = ({ match }) => {
  const params = useParams();
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [vendor, setVendor] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const id = params?.id || match?.params?.id;

  useEffect(() => {
    if (id) { loadVendor(id); loadActivity(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadVendor = async (vendorId) => {
    try {
      const res = await window.electronAPI.getSingleSupplier(vendorId);
      setVendor(res || null);
    } catch (err) {
      console.error('Failed to load vendor', err);
      message.error('Failed to load vendor');
    }
  };

  const loadActivity = async (vendorId) => {
    setActivityLoading(true);
    try {
      const res = await window.electronAPI.getVendorActivity?.(Number(vendorId));
      setActivity(res && !res.error ? res : { purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] });
    } catch { setActivity({ purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] }); }
    finally { setActivityLoading(false); }
  };

  if (!vendor) return <Card title="Vendor Details" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.goBack()}>Back</Button>}>Loading...</Card>;

  const fullAddr = [vendor.address1, vendor.address2, vendor.city, vendor.state, vendor.postal_code, vendor.country].filter(Boolean).join(', ');
  const money = (v) => `${cSym} ${Number(v || 0).toFixed(2)}`;
  const a = activity || { purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] };

  const tabTable = (dataSource, columns, emptyText) => (
    <Table size="small" rowKey="id" dataSource={dataSource || []} columns={columns} pagination={{ pageSize: 10 }}
      locale={{ emptyText }} />
  );

  return (
    <Card
      title={`Vendor: ${vendor.display_name || vendor.first_name}`}
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.goBack()}>Back</Button>}
    >
      <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Name" span={2}>{vendor.display_name || `${vendor.first_name} ${vendor.last_name}`}</Descriptions.Item>
        <Descriptions.Item label="Company">{vendor.company_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Email">{vendor.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Phone">{formatPhone(vendor.phone_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{formatPhone(vendor.mobile_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Fax">{vendor.fax || '-'}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{fullAddr || '-'}</Descriptions.Item>
        <Descriptions.Item label="Opening Balance">{money(vendor.opening_balance)}</Descriptions.Item>
        <Descriptions.Item label="Due Amount">{vendor.due_amount ? money(vendor.due_amount.due_amount) : money(0)}</Descriptions.Item>
        <Descriptions.Item label="Notes" span={2}>{vendor.notes || '-'}</Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Vendor Activity</strong>
        <Button size="small" icon={<ReloadOutlined />} loading={activityLoading} onClick={() => loadActivity(id)}>Refresh</Button>
      </div>

      {activityLoading && !activity ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Loading vendor activity..." /></div>
      ) : (
        <Tabs>
          <Tabs.TabPane tab={`Purchase Orders (${a.purchaseOrders.length})`} key="pos">
            {tabTable(a.purchaseOrders, [
              { title: 'PO #', dataIndex: 'po_number', render: (v, r) => <a onClick={() => history.push('/main/vendors/purchasing/purchase-orders')}>{v || `PO-${r.id}`}</a> },
              { title: 'Date', dataIndex: 'po_date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Total', dataIndex: 'total', align: 'right', render: v => money(v) },
              { title: 'Status', dataIndex: 'status', render: v => <Tag>{v || 'DRAFT'}</Tag> },
            ], 'No purchase orders.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Receipts (${a.receipts.length})`} key="receipts">
            {tabTable(a.receipts, [
              { title: 'Receipt #', dataIndex: 'receipt_number' },
              { title: 'Date', dataIndex: 'receipt_date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Reference', dataIndex: 'reference', render: v => v || '-' },
            ], 'No receipts.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Bills (${a.bills.length})`} key="bills">
            {tabTable(a.bills, [
              { title: 'Bill', dataIndex: 'ref_no', render: (v, r) => <a onClick={() => history.push(`/main/vendors/bills/edit/${r.id}`)}>{v || `#${r.id}`}</a> },
              { title: 'Date', dataIndex: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Status', dataIndex: 'status', render: v => <Tag>{v || '-'}</Tag> },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => money(v) },
            ], 'No bills.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Payments (${a.payments.length})`} key="payments">
            {tabTable(a.payments, [
              { title: 'Date', dataIndex: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Bill', dataIndex: 'ref_no', render: (v, r) => <a onClick={() => history.push(`/main/vendors/bills/edit/${r.expense_id}`)}>{v || `#${r.expense_id}`}</a> },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => money(v) },
              { title: 'Status', dataIndex: 'status', render: v => <Tag color={String(v || '').toLowerCase() === 'active' ? 'green' : 'default'}>{v || 'Active'}</Tag> },
            ], 'No payments.')}
          </Tabs.TabPane>
          <Tabs.TabPane tab={`Credits (${a.credits.length})`} key="credits">
            {tabTable(a.credits, [
              { title: 'Date', dataIndex: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Reference', dataIndex: 'reference', render: v => v || '-' },
              { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => money(v) },
              { title: 'Remaining', dataIndex: 'remaining_amount', align: 'right', render: v => money(v) },
              { title: 'Status', dataIndex: 'status', render: v => <Tag>{v || 'Active'}</Tag> },
            ], 'No vendor credits.')}
          </Tabs.TabPane>
        </Tabs>
      )}
      {!activityLoading && !a.purchaseOrders.length && !a.receipts.length && !a.bills.length && !a.payments.length && !a.credits.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity for this vendor yet." style={{ marginTop: 8 }} />
      )}
    </Card>
  );
};

export default VendorDetails;
