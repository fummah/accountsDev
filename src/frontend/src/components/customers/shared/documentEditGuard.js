import React from 'react';
import { Modal } from 'antd';
import { useHistory } from 'react-router-dom';
import { Z } from '../../../utils/layers';

// Reusable guards for editing already-saved documents (invoices / quotes):
//  - first material edit warning
//  - stronger payment-impact warning for invoices that already have payments
//  - financial-impact confirmation at save time
//  - unsaved-changes navigation / browser-close protection

function confirmModal({ title, content, okText, cancelText, okDanger }) {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText: okText || 'Continue',
      cancelText: cancelText || 'Cancel',
      okButtonProps: okDanger ? { danger: true } : undefined,
      centered: true,
      // Sit above every application dialog, even when raised from inside one.
      zIndex: Z.CONFIRM,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

const money = (sym, v) => `${sym || ''} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

// Generic "editing an already-saved document" warning.
export function confirmSavedDocumentEdit(docType = 'Invoice') {
  const label = String(docType).toLowerCase();
  return confirmModal({
    title: `Edit saved ${label}?`,
    content: (
      <div>
        <p style={{ marginBottom: 8 }}>You are making changes to a {label} that has already been saved.</p>
        <p style={{ margin: 0 }}>These changes may affect totals, balances, reports and customer records.</p>
      </div>
    ),
    okText: 'Continue Editing',
    cancelText: 'Cancel',
  });
}

// Stronger warning when the invoice already has payments applied and the user is
// attempting a financial change.
export function confirmPaymentImpact({ paidToDate, currentTotal, currencySymbol }) {
  return confirmModal({
    title: 'Payments already applied',
    content: (
      <div>
        <p style={{ marginBottom: 8 }}>This invoice already has payments applied to it.</p>
        <p style={{ marginBottom: 8 }}>
          Paid to date: <strong>{money(currencySymbol, paidToDate)}</strong><br />
          Current invoice total: <strong>{money(currencySymbol, currentTotal)}</strong>
        </p>
        <p style={{ marginBottom: 8 }}>Changing the invoice amount may change the outstanding balance and payment status.</p>
        <p style={{ margin: 0 }}>Existing payments will not be changed automatically.</p>
      </div>
    ),
    okText: 'Continue Editing',
    cancelText: 'Cancel',
  });
}

// Final confirmation before saving a changed invoice that has payments.
export function confirmFinancialImpact({ previousTotal, newTotal, paidToDate, newBalance, newStatus, currencySymbol }) {
  return confirmModal({
    title: 'Confirm invoice changes',
    content: (
      <div>
        <p style={{ marginBottom: 8 }}>This invoice has payments applied.</p>
        <p style={{ marginBottom: 8 }}>
          Previous total: <strong>{money(currencySymbol, previousTotal)}</strong><br />
          New total: <strong>{money(currencySymbol, newTotal)}</strong><br />
          Paid to date: <strong>{money(currencySymbol, paidToDate)}</strong><br />
          New balance due: <strong>{money(currencySymbol, newBalance)}</strong>
        </p>
        <p style={{ marginBottom: 8 }}>After saving, this invoice will become <strong>{newStatus}</strong>.</p>
        <p style={{ margin: 0 }}>Existing payment records will remain unchanged.</p>
      </div>
    ),
    okText: 'Save Changes',
    cancelText: 'Cancel',
  });
}

// Generic confirmation for a document lifecycle action (Accept / Decline /
// Convert). Used by the quote workflow buttons so each transition is explicit.
export function confirmDocumentAction({ title, content, okText, cancelText, okDanger }) {
  return confirmModal({ title, content, okText, cancelText, okDanger });
}

// Warn when leaving a page with unsaved changes. Intercepts in-app navigation
// with a modal, and browser refresh/close with beforeunload.
// `bypassRef` lets a successful save navigate without the prompt.
export function useUnsavedChanges(isDirty, bypassRef) {
  const history = useHistory();

  React.useEffect(() => {
    if (!isDirty) return undefined;
    const unblock = history.block((location) => {
      if (bypassRef && bypassRef.current) {
        bypassRef.current = false;
        return true;
      }
      Modal.confirm({
        title: 'Unsaved changes',
        content: 'You have unsaved changes. Do you want to leave without saving them?',
        okText: 'Leave without saving',
        cancelText: 'Stay on page',
        okButtonProps: { danger: true },
        centered: true,
        onOk: () => {
          unblock();
          history.push(`${location.pathname}${location.search || ''}`);
        },
      });
      return false;
    });
    return () => unblock();
  }, [history, isDirty, bypassRef]);

  React.useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
