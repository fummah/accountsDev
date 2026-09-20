import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tag, Input, Spin, Empty } from 'antd';

const SHORTCUTS = [
  { keys: 'Ctrl+I', action: 'New Invoice', path: '/main/customers/invoices/new' },
  { keys: 'Ctrl+E', action: 'New Expense', path: '/main/vendors/bills/enter' },
  { keys: 'Ctrl+J', action: 'New Journal Entry', path: '/main/accountant/journal-entries' },
  { keys: 'Ctrl+B', action: 'Enter Bill', path: '/main/vendors/bills/enter' },
  { keys: 'Ctrl+Q', action: 'New Quote', path: '/main/customers/quotes/new' },
  { keys: 'Ctrl+D', action: 'Dashboard', path: '/main/dashboard/home' },
  { keys: 'Ctrl+R', action: 'Reports', path: '/main/reports/profit-loss' },
  { keys: 'Ctrl+P', action: 'Process Payroll', path: '/main/employees/payroll' },
  { keys: 'Ctrl+T', action: 'Transactions', path: '/main/accountant/enter-transaction' },
  { keys: 'Ctrl+L', action: 'Chart of Accounts', path: '/main/accountant/chart-of-accounts' },
  { keys: 'Ctrl+M', action: 'Customer List', path: '/main/customers/list' },
  { keys: 'Ctrl+K', action: 'Products / Items', path: '/main/inventory/items' },
  { keys: 'Ctrl+G', action: 'General Ledger', path: '/main/accountant/general-ledger' },
  { keys: 'Ctrl+Shift+R', action: 'Bank Reconciliation', path: '/main/banking/reconcile' },
  { keys: 'Ctrl+Shift+D', action: 'Make Deposit', path: '/main/banking/deposits' },
  { keys: 'Ctrl+Shift+T', action: 'Transfer Funds', path: '/main/banking/transfers' },
  { keys: 'Ctrl+Shift+P', action: 'Point of Sale', path: '/main/pos/sale' },
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
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Real global search against the backend (customers, invoices, quotes,
  // transactions, expenses, accounts, items).
  useEffect(() => {
    if (!searchVisible) return;
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.globalSearch?.(q);
        if (!cancelled) setSearchResults((res && res.success && Array.isArray(res.results)) ? res.results : []);
      } catch (e) {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, searchVisible]);

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

      <Modal title="Global Search" visible={searchVisible} onCancel={() => { setSearchVisible(false); setSearchQuery(''); setSearchResults([]); }} footer={null} width={600}>
        <Input
          autoFocus
          placeholder="Search customers, invoices, quotes, transactions, accounts, items..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onPressEnter={() => {
            const match = searchResults[0];
            if (match) {
              if (history && history.push) history.push(match.route);
              else window.location.hash = '#' + match.route;
              setSearchVisible(false);
              setSearchQuery('');
              setSearchResults([]);
            }
          }}
          style={{ marginBottom: 16 }}
        />
        {searching ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div> : (
          searchResults.length === 0 && searchQuery.trim()
            ? <Empty description="No matches found" style={{ margin: '24px 0' }} />
            : <Table
                columns={[
                  { title: 'Type', dataIndex: 'kind', key: 'kind', width: 130, render: v => <Tag>{String(v || '').replace(/-/g, ' ')}</Tag> },
                  { title: 'Result', dataIndex: 'title', key: 'title' },
                  { title: 'Detail', dataIndex: 'subtitle', key: 'subtitle', render: v => <span style={{ color: '#888' }}>{v}</span> },
                ]}
                dataSource={searchResults}
                rowKey={(r, i) => `${r.kind}-${r.title}-${i}`}
                size="small"
                pagination={false}
                loading={false}
                onRow={(record) => ({
                  onClick: () => {
                    if (record.route) {
                      if (history && history.push) history.push(record.route);
                      else window.location.hash = '#' + record.route;
                      setSearchVisible(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }
                  },
                  style: { cursor: 'pointer' },
                })}
              />
        )}
      </Modal>
    </>
  );
};

export default KeyboardShortcuts;
