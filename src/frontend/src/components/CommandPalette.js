import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Modal, Input, List, Tag } from 'antd';
import {
  DashboardOutlined, BankOutlined, TeamOutlined, ShopOutlined,
  FileTextOutlined, DollarOutlined, SettingOutlined, BarChartOutlined,
  FundOutlined, RobotOutlined, DatabaseOutlined, SyncOutlined,
  SafetyOutlined, ProjectOutlined, ShoppingCartOutlined, AuditOutlined,
  SearchOutlined, ThunderboltOutlined
} from '@ant-design/icons';

const COMMANDS = [
  // Dashboard
  { label: 'Dashboard', path: '/main/dashboard/home', icon: <DashboardOutlined />, tags: ['home', 'overview'], category: 'Navigation' },
  { label: 'Workflow View', path: '/main/dashboard/flow', icon: <DashboardOutlined />, tags: ['flow', 'workflow'], category: 'Navigation' },
  { label: 'Accountant Dashboard', path: '/main/dashboard/accountant', icon: <AuditOutlined />, tags: ['accountant'], category: 'Navigation' },
  { label: 'Company Dashboard', path: '/main/dashboard/company', icon: <BankOutlined />, tags: ['company'], category: 'Navigation' },

  // Core Accounting
  { label: 'Chart of Accounts', path: '/main/accountant/chart-of-accounts', icon: <AuditOutlined />, tags: ['coa', 'accounts', 'ledger'], category: 'Accounting' },
  { label: 'Journal Entries', path: '/main/accountant/journal-entries', icon: <FileTextOutlined />, tags: ['journal', 'entry', 'debit', 'credit'], category: 'Accounting' },
  { label: 'General Ledger', path: '/main/accountant/general-ledger', icon: <AuditOutlined />, tags: ['ledger', 'gl'], category: 'Accounting' },
  { label: 'Trial Balance', path: '/main/accountant/trial-balance', icon: <BarChartOutlined />, tags: ['trial', 'balance'], category: 'Accounting' },
  { label: 'Bank Reconciliation', path: '/main/accountant/bank-reconciliation', icon: <BankOutlined />, tags: ['reconcile', 'bank'], category: 'Accounting' },
  { label: 'Fixed Assets', path: '/main/accountant/fixed-assets', icon: <BankOutlined />, tags: ['asset', 'depreciation'], category: 'Accounting' },
  { label: 'Transactions', path: '/main/accountant/transactions', icon: <DollarOutlined />, tags: ['transaction'], category: 'Accounting' },

  // Sales
  { label: 'Customers', path: '/main/customers/center', icon: <TeamOutlined />, tags: ['customer', 'client', 'buyer'], category: 'Sales' },
  { label: 'Invoices', path: '/main/customers/invoices/list', icon: <FileTextOutlined />, tags: ['invoice', 'bill', 'send'], category: 'Sales' },
  { label: 'Quotes / Estimates', path: '/main/customers/quotes/list', icon: <FileTextOutlined />, tags: ['quote', 'estimate', 'proposal'], category: 'Sales' },
  { label: 'Payments Received', path: '/main/customers/payments', icon: <DollarOutlined />, tags: ['payment', 'receive', 'income'], category: 'Sales' },

  // Expenses
  { label: 'Expenses', path: '/main/expenses', icon: <DollarOutlined />, tags: ['expense', 'cost', 'spend', 'bill'], category: 'Expenses' },
  { label: 'Vendors / Suppliers', path: '/main/vendors', icon: <ShopOutlined />, tags: ['vendor', 'supplier'], category: 'Expenses' },

  // Banking
  { label: 'Banking', path: '/main/banking', icon: <BankOutlined />, tags: ['bank', 'deposit', 'transfer'], category: 'Banking' },
  { label: 'Bank Statements', path: '/main/bank-statements', icon: <BankOutlined />, tags: ['statement', 'import', 'csv'], category: 'Banking' },

  // Employees
  { label: 'Employees', path: '/main/employees', icon: <TeamOutlined />, tags: ['employee', 'staff', 'hr'], category: 'HR' },
  { label: 'Payroll', path: '/main/employees/payroll', icon: <DollarOutlined />, tags: ['payroll', 'salary', 'wage'], category: 'HR' },

  // Inventory & POS
  { label: 'Inventory', path: '/main/inventory', icon: <ShoppingCartOutlined />, tags: ['inventory', 'stock', 'warehouse', 'product'], category: 'Inventory' },
  { label: 'Point of Sale', path: '/main/pos', icon: <ShoppingCartOutlined />, tags: ['pos', 'sale', 'register', 'cashier'], category: 'POS' },

  // Projects & CRM
  { label: 'Projects', path: '/main/projects', icon: <ProjectOutlined />, tags: ['project', 'task', 'timesheet'], category: 'Projects' },
  { label: 'CRM', path: '/main/crm', icon: <TeamOutlined />, tags: ['crm', 'lead', 'pipeline', 'deal'], category: 'CRM' },

  // Reports
  { label: 'Profit & Loss', path: '/main/reports/profit-loss', icon: <BarChartOutlined />, tags: ['profit', 'loss', 'income', 'p&l'], category: 'Reports' },
  { label: 'Balance Sheet', path: '/main/reports/balance-sheet', icon: <BarChartOutlined />, tags: ['balance', 'sheet', 'equity'], category: 'Reports' },
  { label: 'Cash Flow Statement', path: '/main/reports/cash-flow', icon: <FundOutlined />, tags: ['cash', 'flow'], category: 'Reports' },
  { label: 'A/R Aging', path: '/main/reports/ar-aging', icon: <BarChartOutlined />, tags: ['receivable', 'aging', 'ar'], category: 'Reports' },
  { label: 'A/P Aging', path: '/main/reports/ap-aging', icon: <BarChartOutlined />, tags: ['payable', 'aging', 'ap'], category: 'Reports' },
  { label: 'Job Costing', path: '/main/reports/job-costing', icon: <BarChartOutlined />, tags: ['job', 'costing'], category: 'Reports' },
  { label: 'Report Builder', path: '/main/reports/builder', icon: <BarChartOutlined />, tags: ['report', 'build', 'custom'], category: 'Reports' },
  { label: 'Budget vs Actual', path: '/main/reports/budget-vs-actual', icon: <BarChartOutlined />, tags: ['budget', 'actual', 'variance', 'forecast'], category: 'Reports' },
  { label: 'Audit Trail', path: '/main/reports/audit-trail', icon: <AuditOutlined />, tags: ['audit', 'trail', 'log', 'chain', 'integrity'], category: 'Reports' },

  // Recurring
  { label: 'Recurring Transactions', path: '/main/accountant/recurring', icon: <SyncOutlined />, tags: ['recurring', 'repeat', 'schedule', 'auto'], category: 'Accounting' },

  // Analytics & AI
  { label: 'Analytics Dashboard', path: '/main/analytics', icon: <FundOutlined />, tags: ['analytics', 'kpi', 'forecast', 'ai'], category: 'Analytics' },
  { label: 'AI Assistant', path: '/main/assistant', icon: <RobotOutlined />, tags: ['ai', 'assistant', 'ask', 'help', 'chatbot'], category: 'AI' },

  // Documents & Approvals
  { label: 'Document Center', path: '/main/documents', icon: <FileTextOutlined />, tags: ['document', 'attachment', 'file'], category: 'Documents' },
  { label: 'Approvals Center', path: '/main/approvals/center', icon: <SafetyOutlined />, tags: ['approval', 'approve', 'reject'], category: 'Approvals' },

  // Settings
  { label: 'Settings: Preferences', path: '/main/settings/preferences', icon: <SettingOutlined />, tags: ['preference', 'setting'], category: 'Settings' },
  { label: 'Settings: Backup & Export', path: '/main/settings/backup-export', icon: <DatabaseOutlined />, tags: ['backup', 'export', 'csv'], category: 'Settings' },
  { label: 'Settings: Sync / VPN', path: '/main/settings/sync-vpn', icon: <SyncOutlined />, tags: ['sync', 'vpn', 'offline'], category: 'Settings' },
  { label: 'Settings: Database Share', path: '/main/settings/database', icon: <DatabaseOutlined />, tags: ['database', 'share', 'download', 'import'], category: 'Settings' },
  { label: 'Settings: API Server', path: '/main/settings/api', icon: <ThunderboltOutlined />, tags: ['api', 'server', 'rest'], category: 'Settings' },
  { label: 'Settings: Scheduler', path: '/main/settings/scheduler', icon: <SettingOutlined />, tags: ['scheduler', 'task', 'cron'], category: 'Settings' },
  { label: 'Settings: Theme', path: '/main/settings/theme', icon: <SettingOutlined />, tags: ['theme', 'dark', 'light', 'color'], category: 'Settings' },
  { label: 'Settings: Payroll', path: '/main/settings/payroll', icon: <SettingOutlined />, tags: ['payroll', 'setting'], category: 'Settings' },
  { label: 'Settings: Approval Policies', path: '/main/settings/approval-policies', icon: <SafetyOutlined />, tags: ['approval', 'policy'], category: 'Settings' },
  { label: 'Settings: Multi-Currency', path: '/main/settings/currencies', icon: <DollarOutlined />, tags: ['currency', 'exchange', 'rate', 'multi'], category: 'Settings' },
];

const CommandPalette = () => {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const history = useHistory();

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setVisible(v => !v);
      setSearch('');
      setSelectedIndex(0);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 50);
  }, [visible]);

  const filtered = search.trim()
    ? COMMANDS.filter(c => {
        const q = search.toLowerCase();
        return c.label.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.tags.some(t => t.includes(q));
      })
    : COMMANDS;

  const onSelect = (cmd) => {
    setVisible(false);
    setSearch('');
    history.push(cmd.path);
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      onSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      setVisible(false);
    }
  };

  const categoryColors = {
    Navigation: 'blue', Accounting: 'green', Sales: 'gold', Expenses: 'red',
    Banking: 'cyan', HR: 'purple', Inventory: 'orange', POS: 'magenta',
    Projects: 'geekblue', CRM: 'lime', Reports: 'volcano', Analytics: '#108ee9',
    AI: '#722ed1', Documents: '#13c2c2', Approvals: '#eb2f96', Settings: '#8c8c8c',
  };

  return (
    <Modal
      open={visible}
      onCancel={() => setVisible(false)}
      footer={null}
      closable={false}
      width={620}
      bodyStyle={{ padding: 0 }}
      style={{ top: 80 }}
      maskStyle={{ backdropFilter: 'blur(2px)' }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Input
          ref={inputRef}
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="Type to search... (navigate anywhere instantly)"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
          onKeyDown={onInputKeyDown}
          size="large"
          bordered={false}
          style={{ fontSize: 16 }}
        />
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        <List
          dataSource={filtered.slice(0, 20)}
          renderItem={(item, idx) => (
            <List.Item
              onClick={() => onSelect(item)}
              style={{
                cursor: 'pointer',
                padding: '8px 20px',
                background: idx === selectedIndex ? '#e6f7ff' : 'transparent',
                borderLeft: idx === selectedIndex ? '3px solid #1890ff' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <span style={{ fontSize: 18, color: '#595959' }}>{item.icon}</span>
                <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
                <Tag color={categoryColors[item.category] || 'default'} style={{ fontSize: 11 }}>{item.category}</Tag>
              </div>
            </List.Item>
          )}
        />
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>No results found</div>
        )}
      </div>
      <div style={{ padding: '6px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 16, color: '#999', fontSize: 12 }}>
        <span><kbd style={{ padding: '1px 5px', background: '#f5f5f5', borderRadius: 3, border: '1px solid #d9d9d9' }}>↑↓</kbd> navigate</span>
        <span><kbd style={{ padding: '1px 5px', background: '#f5f5f5', borderRadius: 3, border: '1px solid #d9d9d9' }}>Enter</kbd> open</span>
        <span><kbd style={{ padding: '1px 5px', background: '#f5f5f5', borderRadius: 3, border: '1px solid #d9d9d9' }}>Esc</kbd> close</span>
        <span style={{ marginLeft: 'auto' }}><kbd style={{ padding: '1px 5px', background: '#f5f5f5', borderRadius: 3, border: '1px solid #d9d9d9' }}>Ctrl+K</kbd> to toggle</span>
      </div>
    </Modal>
  );
};

export default CommandPalette;
