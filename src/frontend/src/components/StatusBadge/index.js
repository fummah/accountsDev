import React from 'react';
import { Tag } from 'antd';

/**
 * Maps invoice/quote status to Ant Design Tag color.
 * Accepted = green, Partial = grey, Declined = red.
 */
const STATUS_COLORS = {
  Accepted: 'green',
  Partial: 'default',
  Partially: 'default',
  Declined: 'red',
  Pending: 'orange',
  Paid: 'green',
  Overdue: 'red',
  Draft: 'default',
  Sent: 'blue',
  Approved: 'cyan',
  Rejected: 'red',
  Cancelled: 'default',
};

const StatusBadge = ({ status, children }) => {
  const raw = (status || '').trim();
  const s = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  const label = children != null ? children : raw || '—';
  const color = STATUS_COLORS[s] || STATUS_COLORS[raw] || (raw ? 'default' : 'default');
  return <Tag color={color}>{label}</Tag>;
};

export default StatusBadge;
