import React from 'react';
import { Tag } from 'antd';

/**
 * Read-only status badges.
 *
 * Invoice status is calculated from real money (Open → Partially Paid → Paid)
 * and quote status is driven by workflow actions (Pending → Accepted / Declined
 * / Converted). Neither is ever user editable, so these badges are purely
 * presentational — no dropdown, no click handler.
 */

// Canonical label lookup so legacy / snake-case / mixed-case values all render
// with the right wording and colour.
const CANONICAL = {
  open: 'Open',
  partially_paid: 'Partially Paid',
  partiallypaid: 'Partially Paid',
  'partially paid': 'Partially Paid',
  partial: 'Partially Paid',
  paid: 'Paid',
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  rejected: 'Declined',
  converted: 'Converted',
  invoiced: 'Converted',
  draft: 'Draft',
  void: 'Void',
  voided: 'Void',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  overdue: 'Overdue',
  sent: 'Sent',
  unpaid: 'Open',
};

// Design-system colours (Ant Design Tag palette used across the app).
const COLORS = {
  // Invoice financial states
  Open: 'blue',
  'Partially Paid': 'orange',
  Paid: 'green',
  // Quote workflow states
  Pending: 'gold',
  Accepted: 'green',
  Declined: 'red',
  Converted: 'purple',
  // Document lifecycle / misc
  Draft: 'default',
  Void: 'volcano',
  Cancelled: 'default',
  Overdue: 'red',
  Sent: 'blue',
};

export const normalizeStatus = (status) => {
  const raw = String(status == null ? '' : status).trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (CANONICAL[key]) return CANONICAL[key];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

export const statusColor = (status) => COLORS[normalizeStatus(status)] || 'default';

const StatusBadge = ({ status, children, style }) => {
  const label = normalizeStatus(status);
  return (
    <Tag color={statusColor(label)} style={{ margin: 0, fontWeight: 500, ...(style || {}) }}>
      {children != null ? children : (label || '—')}
    </Tag>
  );
};

/** Invoice status badge — Open / Partially Paid / Paid (+ Draft / Void / Cancelled). */
export const InvoiceStatusBadge = (props) => <StatusBadge {...props} />;

/** Quote status badge — Pending / Accepted / Declined / Converted. */
export const QuoteStatusBadge = (props) => <StatusBadge {...props} />;

export default StatusBadge;
