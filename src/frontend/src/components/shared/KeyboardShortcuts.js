import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tag, Input } from 'antd';

const SHORTCUTS = [
  { keys: 'Ctrl+I', action: 'New Invoice', path: '/main/customers/invoices/create' },
  { keys: 'Ctrl+E', action: 'New Expense', path: '/main/expenses/create' },
  { keys: 'Ctrl+J', action: 'New Journal Entry', path: '/main/accountant/journal-entries' },
  { keys: 'Ctrl+B', action: 'Enter Bill', path: '/main/vendors/bills/enter' },
  { keys: 'Ctrl+Q', action: 'New Quote', path: '/main/customers/quotes/create' },
  { keys: 'Ctrl+D', action: 'Dashboard', path: '/main/dashboard/home' },
  { keys: 'Ctrl+R', action: 'Reports', path: '/main/reports' },
  { keys: 'Ctrl+P', action: 'Process Payroll', path: '/main/employees/payroll' },
  { keys: 'Ctrl+T', action: 'Transactions', path: '/main/accountant/enter-transaction' },
  { keys: 'Ctrl+L', action: 'Chart of Accounts', path: '/main/accountant/chart-of-accounts' },
  { keys: 'Ctrl+M', action: 'Customer List', path: '/main/customers' },
  { keys: 'Ctrl+K', action: 'Products / Items', path: '/main/inventory/products' },
  { keys: 'Ctrl+G', action: 'General Ledger', path: '/main/accountant/general-ledger' },
  { keys: 'Ctrl+Shift+R', action: 'Bank Reconciliation', path: '/main/banking/reconcile' },
  { keys: 'Ctrl+Shift+D', action: 'Make Deposit', path: '/main/banking/deposits' },
  { keys: 'Ctrl+Shift+T', action: 'Transfer Funds', path: '/main/banking/transfers' },
  { keys: 'Ctrl+Shift+P', action: 'Point of Sale', path: '/main/pos' },
  { keys: 'Ctrl+Shift+S', action: 'Settings', path: '/main/settings/preferences' },
  { keys: 'Ctrl+/', action: 'Show Keyboard Shortcuts', path: null },
  { keys: 'Ctrl+Shift+F', action: 'Global Search', path: null },
  { keys: 'Escape', action: 'Close Modal / Cancel', path: null },
];

const parseKey = (shortcutKeys) => {
  const parts = shortcutKeys.toLowerCase().split('+');
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter(p => !['ctrl', 'shift', 'alt'].includes(p))[0],
  };
};

const KeyboardShortcuts = ({ history }) => {
  const [visible, setVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleKeyDown = useCallback((e) => {
    // Ignore if typing in an input/textarea/select
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) && !(e.ctrlKey && e.key === '/')) return;

    for (const s of SHORTCUTS) {
      const parsed = parseKey(s.keys);
      if (
        e.ctrlKey === parsed.ctrl &&
        e.shiftKey === parsed.shift &&
        e.key.toLowerCase() === parsed.key
      ) {
        e.preventDefault();
        e.stopPropagation();

        if (s.keys === 'Ctrl+/') {
          setVisible(v => !v);
          return;
        }
        if (s.keys === 'Ctrl+Shift+F') {
          setSearchVisible(v => !v);
          return;
        }
        if (s.keys === 'Escape') {
          setVisible(false);
          setSearchVisible(false);
          return;
        }
        if (s.path) {
          if (history && history.push) {
            history.push(s.path);
          } else {
            window.location.hash = '#' + s.path;
          }
        }
        return;
      }
    }
  }, [history]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const columns = [
    { title: 'Shortcut', dataIndex: 'keys', key: 'keys', width: 180, render: v => {
      const parts = v.split('+');
      return parts.map((p, i) => <React.Fragment key={i}>{i > 0 && ' + '}<Tag color="blue" style={{ fontFamily: 'monospace' }}>{p}</Tag></React.Fragment>);
    }},
    { title: 'Action', dataIndex: 'action', key: 'action' },
  ];

  return (
    <>
      <Modal title="Keyboard Shortcuts" visible={visible} onCancel={() => setVisible(false)} footer={null} width={500}>
        <p style={{ color: '#888', marginBottom: 16 }}>Press <Tag color="blue">Ctrl</Tag> + <Tag color="blue">/</Tag> anywhere to toggle this panel</p>
        <Table columns={columns} dataSource={SHORTCUTS} rowKey="keys" size="small" pagination={false} />
      </Modal>

      <Modal title="Quick Navigation" visible={searchVisible} onCancel={() => setSearchVisible(false)} footer={null} width={500}>
        <Input
          autoFocus
          placeholder="Type to search actions..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onPressEnter={() => {
            const match = SHORTCUTS.find(s => s.action.toLowerCase().includes(searchQuery.toLowerCase()) && s.path);
            if (match) {
              if (history && history.push) history.push(match.path);
              else window.location.hash = '#' + match.path;
              setSearchVisible(false);
              setSearchQuery('');
            }
          }}
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={[
            { title: 'Action', dataIndex: 'action', key: 'action' },
            { title: 'Shortcut', dataIndex: 'keys', key: 'keys', render: v => <Tag>{v}</Tag> },
          ]}
          dataSource={SHORTCUTS.filter(s => s.path && s.action.toLowerCase().includes(searchQuery.toLowerCase()))}
          rowKey="keys"
          size="small"
          pagination={false}
          onRow={(record) => ({
            onClick: () => {
              if (record.path) {
                if (history && history.push) history.push(record.path);
                else window.location.hash = '#' + record.path;
                setSearchVisible(false);
                setSearchQuery('');
              }
            },
            style: { cursor: 'pointer' },
          })}
        />
      </Modal>
    </>
  );
};

export default KeyboardShortcuts;
