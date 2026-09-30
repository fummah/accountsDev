import React from 'react';
import { Card, Tag, Space } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

/**
 * Compact operational-alert strip shared by the Inventory and Purchasing
 * dashboards. It renders counts that come from the SAME central
 * inventoryAlertsService the Alerts page uses (never recalculated here).
 */
const DEFS = [
  { key: 'lowStock', label: 'Low Stock', color: '#faad14', route: '/main/inventory/reorder' },
  { key: 'outOfStock', label: 'Out of Stock', color: '#f5222d', route: '/main/inventory/items?stockStatus=OUT_OF_STOCK' },
  { key: 'poOverdue', label: 'Overdue POs', color: '#fa541c', route: '/main/vendors/purchasing/purchase-orders?delivery=OVERDUE' },
  { key: 'partialReceipt', label: 'Partial Receipts', color: '#1890ff', route: '/main/vendors/purchasing/purchase-orders?status=PARTIALLY_RECEIVED' },
  { key: 'billReceiptMismatch', label: 'Bill / Receipt Mismatch', color: '#eb2f96', route: '/main/inventory/alerts?type=BILL_RECEIPT_MISMATCH' },
];

const AlertStrip = ({ alerts, only, title }) => {
  const history = useHistory();
  const defs = only ? DEFS.filter((d) => only.includes(d.key)) : DEFS;
  const total = defs.reduce((s, d) => s + (Number(alerts && alerts[d.key]) || 0), 0);

  return (
    <Card
      size="small"
      className="al-stat-card"
      style={{ marginBottom: 20 }}
      title={<Space><BellOutlined /> {title || 'Operational Alerts'} {total > 0 ? <Tag color="red">{total}</Tag> : <Tag color="green">Clear</Tag>}</Space>}
      extra={<a onClick={() => history.push('/main/inventory/alerts')}>View all alerts</a>}
    >
      <Space wrap size={8}>
        {defs.map((d) => {
          const n = Number(alerts && alerts[d.key]) || 0;
          return (
            <Tag
              key={d.key}
              color={n > 0 ? d.color : 'default'}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 13, borderRadius: 8 }}
              onClick={() => history.push(d.route)}
            >
              {d.label}: <strong>{n}</strong>
            </Tag>
          );
        })}
      </Space>
    </Card>
  );
};

export default AlertStrip;
