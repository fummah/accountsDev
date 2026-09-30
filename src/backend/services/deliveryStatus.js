/**
 * services/deliveryStatus.js — the ONE definition of a PO's Delivery Status.
 *
 * Delivery Status is DERIVED (never stored) from the PO Expected Date and the
 * remaining-to-receive quantity, using local CALENDAR dates (Expected Date is a
 * business date, not an instant):
 *
 *   inactive (Draft/Cancelled/Closed)     → null  (not an active delivery)
 *   remainingToReceive <= 0               → RECEIVED
 *   no Expected Date                      → NO_DATE
 *   Expected Date  < today (local)        → OVERDUE
 *   Expected Date == today (local)        → DUE_TODAY
 *   Expected Date  > today (local)        → EXPECTED
 *
 * No dependency on PO/Bill/Payment status — receiving is the physical event.
 */

const STATUS = {
  RECEIVED: 'RECEIVED',
  NO_DATE: 'NO_DATE',
  OVERDUE: 'OVERDUE',
  DUE_TODAY: 'DUE_TODAY',
  EXPECTED: 'EXPECTED',
};

const LABEL = {
  RECEIVED: 'Received',
  NO_DATE: 'No Date',
  OVERDUE: 'Overdue',
  DUE_TODAY: 'Due Today',
  EXPECTED: 'Expected',
};

const localToday = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const computeDeliveryStatus = ({ expectedDate, remainingToReceive, active = true }, today = localToday()) => {
  if (!active) return null;
  const rem = Number(remainingToReceive) || 0;
  if (rem <= 0.005) return STATUS.RECEIVED;
  if (!expectedDate) return STATUS.NO_DATE;
  const d = String(expectedDate).slice(0, 10);
  if (d < today) return STATUS.OVERDUE;
  if (d === today) return STATUS.DUE_TODAY;
  return STATUS.EXPECTED;
};

module.exports = { STATUS, LABEL, computeDeliveryStatus, localToday };
