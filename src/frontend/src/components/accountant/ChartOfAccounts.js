import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Modal, message, Select, Space, Card, Row, Col,
  Tag, Tooltip, Drawer, Divider, Popconfirm, InputNumber, Tabs, Switch,
  Badge, Descriptions, Empty, Spin, Typography, DatePicker, Alert
} from 'antd';
import {
  PlusOutlined, PlusCircleOutlined, EditOutlined, DeleteOutlined, DownloadOutlined,
  AccountBookOutlined, DollarOutlined, BankOutlined, WalletOutlined, CreditCardOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, EyeOutlined,
  ApartmentOutlined, UnorderedListOutlined, ReloadOutlined, PrinterOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SwapOutlined, LockOutlined,
  SafetyOutlined, BookOutlined, UploadOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Search } = Input;
const { TabPane } = Tabs;
const { Text, Title } = Typography;

/* ─── Account type config ─── */

const ACCOUNT_TYPES = {
  Asset:                { color: '#52c41a', icon: <AccountBookOutlined />, order: 1,  range: '1000', normalBalance: 'Debit'  },
  Bank:                 { color: '#1890ff', icon: <BankOutlined />,        order: 2,  range: '1100', normalBalance: 'Debit'  },
  Cash:                 { color: '#eb2f96', icon: <WalletOutlined />,      order: 3,  range: '1050', normalBalance: 'Debit'  },
  Liability:            { color: '#f5222d', icon: <ArrowDownOutlined />,   order: 4,  range: '2000', normalBalance: 'Credit' },
  'Credit Card':        { color: '#722ed1', icon: <CreditCardOutlined />,  order: 5,  range: '2100', normalBalance: 'Credit' },
  Loan:                 { color: '#eb2f96', icon: <WalletOutlined />,      order: 6,  range: '2500', normalBalance: 'Credit' },
  Equity:               { color: '#1890ff', icon: <AccountBookOutlined />, order: 7,  range: '3000', normalBalance: 'Credit' },
  Income:               { color: '#13c2c2', icon: <ArrowUpOutlined />,     order: 8,  range: '4000', normalBalance: 'Credit' },
  'Cost of Goods Sold': { color: '#fa8c16', icon: <DollarOutlined />,      order: 9,  range: '5000', normalBalance: 'Debit'  },
  Expense:              { color: '#faad14', icon: <DollarOutlined />,      order: 10, range: '6000', normalBalance: 'Debit'  },
  'Other Income':       { color: '#52c41a', icon: <ArrowUpOutlined />,     order: 11, range: '7000', normalBalance: 'Credit' },
  'Other Expense':      { color: '#faad14', icon: <DollarOutlined />,      order: 12, range: '8000', normalBalance: 'Debit'  },
};

/* ─── Sub-types per account type ─── */
const ACCOUNT_SUBTYPES = {
  Asset:                ['Accounts Receivable','Inventory','Fixed Assets','Other Current Assets','Prepaid Expenses','Undeposited Funds','Other Asset'],
  Bank:                 ['Checking','Savings','Money Market','Other Bank'],
  Cash:                 ['Petty Cash','Cash on Hand'],
  Liability:            ['Accounts Payable','Payroll Liability','Other Current Liability','Deferred Revenue'],
  'Credit Card':        ['Visa','Mastercard','American Express','Other Credit Card'],
  Loan:                 ['Short-Term Loan','Long-Term Loan','Line of Credit','Mortgage','Equipment Loan','Vehicle Loan','Other Loan'],
  Equity:               ["Owner's Equity",'Retained Earnings','Opening Balance Equity','Common Stock','Drawings'],
  Income:               ['Sales','Service Income','Product Sales','Discounts','Other Income'],
  'Cost of Goods Sold': ['Cost of Goods Sold','Purchases','Direct Labor','Freight'],
  Expense:              ['Advertising','Repairs & Maintenance','Utilities','Office Supplies','Rent','Salaries & Wages','Insurance','Travel','Depreciation','Professional Fees','Vehicle Expenses','Bank Charges','Other Expense'],
  'Other Income':       ['Interest Income','Gain on Sale','Other Miscellaneous Income'],
  'Other Expense':      ['Interest Expense','Loss on Sale','Other Miscellaneous Expense'],
};

/* ─── Helpers ─── */
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const csvEscape = (v) => {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildTree = (flat) => {
  const map = {};
  const roots = [];
  flat.forEach(a => { map[a.id] = { ...a, children: [] }; });
  flat.forEach(a => {
    if (a.parentId && map[a.parentId]) {
      map[a.parentId].children.push(map[a.id]);
    } else {
      roots.push(map[a.id]);
    }
  });
  const stripEmpty = (nodes) => nodes.map(n => {
    if (n.children.length === 0) { const { children, ...rest } = n; return rest; }
    return { ...n, children: stripEmpty(n.children) };
  });
  return stripEmpty(roots);
};

/* ─── Component ─── */
const ChartOfAccounts = () => {
  const { symbol: cSym } = useCurrency();

  /* Core data */
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [customAccountTypes, setCustomAccountTypes] = useState([]);
  const [customSubTypes, setCustomSubTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [newSubTypeName, setNewSubTypeName] = useState('');
  const [addTypeModalVisible, setAddTypeModalVisible] = useState(false);
  const [addSubTypeModalVisible, setAddSubTypeModalVisible] = useState(false);

  /* Filters */
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const handleTabChange = (key) => { setActiveTab(key); setFilterType('all'); };
  const [treeView, setTreeView] = useState(false);

  /* Batch selection */
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  /* Detail drawer */
  const [drawerAccount, setDrawerAccount] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerTxns, setDrawerTxns] = useState([]);
  const [drawerTxnLoading, setDrawerTxnLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState('info');

  /* Template seed modal */
  const [seedLoading, setSeedLoading] = useState(false);

  /* ─── Load ─── */
  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const response = await window.electronAPI.getChartOfAccounts();
      if (!response || response.error) {
        message.error(response?.error || 'Failed to load chart of accounts');
        setLoading(false);
        return;
      }
      const formatted = (Array.isArray(response) ? response : []).map(a => ({
        ...a,
        accountCode: a.accountCode || a.accountNumber || a.number || '',
        status: a.status || 'Active',
        openingBalance: Number(a.openingBalance) || 0,
        balance: Number(a.balance) || 0,
        parentId: a.parentId || null,
        description: a.description || '',
      }));
      setAccounts(formatted);
    } catch (error) {
      console.error('Load accounts error:', error);
      message.error('Failed to load chart of accounts');
    }
    setLoading(false);
  };

  /* ─── Derived data (memoised) ─── */
  const filteredAccounts = useMemo(() => {
    let filtered = [...accounts];
    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(a =>
        (a.accountName || '').toLowerCase().includes(q) ||
        (a.accountCode || '').toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.accountType || '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') filtered = filtered.filter(a => a.accountType === filterType);
    if (filterStatus !== 'all') filtered = filtered.filter(a => a.status === filterStatus);
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
    return filtered;
  }, [accounts, searchText, filterType, filterStatus]);

  const stats = useMemo(() => {
    const byType = {};
    const byTypeCount = {};
    Object.keys(ACCOUNT_TYPES).forEach(t => { byType[t] = 0; byTypeCount[t] = 0; });
    accounts.forEach(a => {
      const t = a.accountType;
      if (byType[t] !== undefined) { byType[t] += a.balance; byTypeCount[t] += 1; }
    });
    const totalAssets = (byType['Asset'] || 0) + (byType['Bank'] || 0) + (byType['Cash'] || 0);
    const totalLiabilities = byType['Liability'] || 0;
    const totalEquity = byType['Equity'] || 0;
    return {
      total: accounts.length,
      active: accounts.filter(a => a.status === 'Active').length,
      inactive: accounts.filter(a => a.status !== 'Active').length,
      totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
      byType, byTypeCount,
      totalAssets, totalLiabilities, totalEquity,
      balanceCheck: totalAssets - totalLiabilities - totalEquity,
    };
  }, [accounts]);

  const treeData = useMemo(() => buildTree(filteredAccounts), [filteredAccounts]);

  /* Dynamic account types: DB-derived + hardcoded defaults + user-added */
  const allAccountTypes = useMemo(() => {
    const fromDb = accounts.map(a => a.accountType).filter(Boolean);
    return [...new Set([...Object.keys(ACCOUNT_TYPES), ...fromDb, ...customAccountTypes])];
  }, [accounts, customAccountTypes]);

  /* Sub-types for selected type: DB-derived + hardcoded + user-added */
  const subTypesForSelected = useMemo(() => {
    const fromDb = accounts.filter(a => a.accountType === selectedType).map(a => a.subType).filter(Boolean);
    const defaults = ACCOUNT_SUBTYPES[selectedType] || [];
    return [...new Set([...defaults, ...fromDb, ...customSubTypes])];
  }, [accounts, selectedType, customSubTypes]);

  /* ─── Auto-suggest account number ─── */
  const suggestAccountCode = useCallback((type) => {
    if (!type) return '';
    const base = Number(ACCOUNT_TYPES[type]?.range) || 9000;
    const existing = accounts
      .filter(a => a.accountType === type && a.accountCode)
      .map(a => Number(a.accountCode) || 0)
      .filter(n => n >= base);
    const next = existing.length ? Math.max(...existing) + 10 : base;
    return String(next);
  }, [accounts]);

  /* ─── CRUD handlers ─── */
  const handleAddEdit = async (values) => {
    try {
      let response;
      const payload = {
        accountName:        values.accountName,
        accountType:        values.accountType,
        subType:            values.subType || null,
        accountNumber:      values.accountCode || '',
        openingBalance:     Number(values.openingBalance) || 0,
        openingBalanceDate: values.openingBalanceDate || null,
        status:             values.status || 'Active',
        parentId:           values.parentId || null,
        description:        values.description || '',
        taxLine:            values.taxLine || null,
        normalBalance:      values.normalBalance || (ACCOUNT_TYPES[values.accountType]?.normalBalance || 'Debit'),
      };
      if (editingId) {
        response = await window.electronAPI.updateChartAccount({ id: editingId, ...payload });
      } else {
        response = await window.electronAPI.insertChartAccount(payload);
      }
      if (!response || !response.success) {
        message.error(response?.message || 'Operation failed');
        return;
      }
      message.success(editingId ? 'Account updated' : 'Account created');
      setIsModalVisible(false);
      form.resetFields();
      setEditingId(null);
      loadAccounts();
    } catch (error) {
      message.error('Operation failed: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDelete = async (id) => {
    const rec = accounts.find(a => a.id === id);
    if (rec?.isSystem) { message.warning('System accounts cannot be deleted.'); return; }
    const children = accounts.filter(a => a.parentId === id);
    if (children.length) { message.warning('Cannot delete: this account has sub-accounts. Reassign them first.'); return; }
    try {
      const response = await window.electronAPI.deleteChartAccount(id);
      if (!response || !response.success) { message.error(response?.message || 'Failed to delete'); return; }
      if (response.softDelete) message.info(response.message);
      else message.success('Account deleted');
      loadAccounts();
    } catch (error) { message.error(error.message || 'Failed to delete'); }
  };

  /* ─── Seed system accounts ─── */
  const handleSeedAccounts = async () => {
    setSeedLoading(true);
    try {
      await window.electronAPI.coaSeedSystemAccounts?.();
      message.success('System accounts seeded successfully');
      loadAccounts();
    } catch (e) { message.error('Seed failed'); }
    setSeedLoading(false);
  };

  const handleToggleStatus = async (record) => {
    try {
      const newStatus = record.status === 'Active' ? 'Inactive' : 'Active';
      const response = await window.electronAPI.updateChartAccount({
        id: record.id, accountName: record.accountName,
        accountType: record.accountType, accountNumber: record.accountCode, status: newStatus,
      });
      if (response && response.success) { message.success(`Account ${newStatus === 'Active' ? 'activated' : 'deactivated'}`); loadAccounts(); }
      else { message.error(response?.message || 'Failed'); }
    } catch { message.error('Failed to update status'); }
  };

  const handleDuplicate = (record) => {
    setEditingId(null);
    setSelectedType(record.accountType);
    form.setFieldsValue({
      accountName:    (record.accountName || '') + ' (Copy)',
      accountType:    record.accountType,
      subType:        record.subType || undefined,
      accountCode:    suggestAccountCode(record.accountType),
      description:    record.description || '',
      openingBalance: 0,
      parentId:       record.parentId || undefined,
      status:         'Active',
      taxLine:        record.taxLine || undefined,
      normalBalance:  record.normalBalance || ACCOUNT_TYPES[record.accountType]?.normalBalance || 'Debit',
    });
    setIsModalVisible(true);
  };

  /* ─── Batch operations ─── */
  const handleBatchStatus = async (newStatus) => {
    let ok = 0;
    for (const id of selectedRowKeys) {
      const rec = accounts.find(a => a.id === id);
      if (!rec || rec.status === newStatus) continue;
      try {
        const r = await window.electronAPI.updateChartAccount({
          id, accountName: rec.accountName, accountType: rec.accountType,
          accountNumber: rec.accountCode, status: newStatus,
        });
        if (r && r.success) ok++;
      } catch {}
    }
    message.success(`${ok} account(s) set to ${newStatus}`);
    setSelectedRowKeys([]);
    loadAccounts();
  };

  const handleBatchDelete = async () => {
    let ok = 0;
    for (const id of selectedRowKeys) {
      const children = accounts.filter(a => a.parentId === id);
      if (children.length) continue;
      try {
        const r = await window.electronAPI.deleteChartAccount(id);
        if (r && r.success) ok++;
      } catch {}
    }
    message.success(`${ok} account(s) deleted`);
    setSelectedRowKeys([]);
    loadAccounts();
  };

  /* ─── Export ─── */
  const handleExport = () => {
    const rows = [
      ['Account Code','Account Name','Type','Sub-Type','Normal Balance','Balance','Opening Balance','Tax Line','Status','Parent','Description'],
      ...filteredAccounts.map(a => {
        const parent = a.parentId ? accounts.find(p => p.id === a.parentId) : null;
        return [
          csvEscape(a.accountCode || a.number), csvEscape(a.accountName), csvEscape(a.accountType),
          csvEscape(a.subType || ''), csvEscape(a.normalBalance || 'Debit'),
          Number(a.balance || 0).toFixed(2), Number(a.openingBalance || 0).toFixed(2),
          csvEscape(a.taxLine || ''), csvEscape(a.status),
          csvEscape(parent ? parent.accountName : ''), csvEscape(a.description || ''),
        ];
      })
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chart_of_accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success(`Exported ${filteredAccounts.length} accounts`);
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { message.error('Pop-up blocked'); return; }
    const tableHtml = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px">
      <thead><tr style="background:#f0f0f0"><th>Code</th><th>Name</th><th>Type</th><th>Sub-Type</th><th>Norm.Bal</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody>${filteredAccounts.map(a => `<tr>
        <td style="font-family:monospace">${a.accountCode || a.number || '-'}</td>
        <td>${a.accountName || '-'}</td>
        <td>${a.accountType || '-'}</td>
        <td style="color:#888;font-size:11px">${a.subType || ''}</td>
        <td style="text-align:center">${a.normalBalance || 'Debit'}</td>
        <td style="text-align:right">${cSym} ${Number(a.balance || 0).toFixed(2)}</td>
        <td>${a.status}</td>
      </tr>`).join('')}</tbody></table>`;
    w.document.write(`<html><head><title>Chart of Accounts</title></head><body>
      <h2>Chart of Accounts</h2><p>Printed: ${new Date().toLocaleDateString()}</p>${tableHtml}
      <script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  /* ─── Detail drawer ─── */
  const openDrawer = async (record) => {
    setDrawerAccount(record);
    setDrawerVisible(true);
    setDrawerTab('info');
    setDrawerTxnLoading(true);
    try {
      const txns = await window.electronAPI?.getAccountActivity?.(record.id) ||
                   await window.electronAPI?.getAccountTransactions?.(record.id);
      setDrawerTxns(Array.isArray(txns) ? txns : []);
    } catch { setDrawerTxns([]); }
    setDrawerTxnLoading(false);
  };

  const subAccounts = useMemo(() => {
    if (!drawerAccount) return [];
    return accounts.filter(a => a.parentId === drawerAccount.id);
  }, [drawerAccount, accounts]);

  /* ─── Table columns ─── */
  const columns = [
    {
      title: 'Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
      width: 95,
      render: (_, record) => (
        <Text code style={{ fontSize: 12 }}>
          {record.accountCode || record.accountNumber || record.number || '-'}
        </Text>
      ),
      sorter: (a, b) => (a.accountCode || '').localeCompare(b.accountCode || ''),
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (text, record) => {
        const parent = record.parentId ? accounts.find(p => p.id === record.parentId) : null;
        return (
          <div>
            <Space size={4}>
              {record.isSystem && <Tooltip title="System account – protected"><LockOutlined style={{ color: '#faad14', fontSize: 11 }} /></Tooltip>}
              <a onClick={() => openDrawer(record)} style={{ fontWeight: 500 }}>{text || '-'}</a>
            </Space>
            {parent && <div style={{ fontSize: 11, color: '#8c8c8c' }}><ApartmentOutlined style={{ marginRight: 4 }} />{parent.accountName}</div>}
            {record.description && <div style={{ fontSize: 11, color: '#bfbfbf' }}>{record.description}</div>}
          </div>
        );
      },
      sorter: (a, b) => (a.accountName || '').localeCompare(b.accountName || ''),
    },
    {
      title: 'Type / Sub-Type',
      dataIndex: 'accountType',
      key: 'accountType',
      width: 190,
      filters: Object.keys(ACCOUNT_TYPES).map(t => ({ text: t, value: t })),
      onFilter: (value, record) => record.accountType === value,
      render: (text, record) => {
        const cfg = ACCOUNT_TYPES[text] || { color: '#8c8c8c', icon: null };
        return (
          <div>
            <Tag color={cfg.color} icon={cfg.icon} style={{ marginBottom: 2 }}>{text || '-'}</Tag>
            {record.subType && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.subType}</div>}
          </div>
        );
      },
    },
    {
      title: 'Normal Bal.',
      dataIndex: 'normalBalance',
      key: 'normalBalance',
      width: 90,
      render: (nb) => (
        <Tag color={nb === 'Debit' ? '#108ee9' : '#87d068'} style={{ fontSize: 11 }}>{nb || 'Debit'}</Tag>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      render: (bal) => {
        const v = Number(bal) || 0;
        return <Text strong style={{ color: v >= 0 ? '#52c41a' : '#f5222d' }}>{cSym} {fmtNum(v)}</Text>;
      },
      sorter: (a, b) => a.balance - b.balance,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      filters: [{ text: 'Active', value: 'Active' }, { text: 'Inactive', value: 'Inactive' }],
      onFilter: (v, r) => r.status === v,
      render: (s) => (
        <Badge status={s === 'Active' ? 'success' : 'default'} text={<Text style={{ fontSize: 12 }}>{s || 'Active'}</Text>} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDrawer(record)} /></Tooltip>
          <Tooltip title={record.isSystem ? 'System account (limited edit)' : 'Edit'}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => {
              setEditingId(record.id);
              setSelectedType(record.accountType);
              form.setFieldsValue({
                ...record,
                accountCode: record.accountCode || record.accountNumber || record.number,
                openingBalance: record.openingBalance || 0,
                subType: record.subType || undefined,
                normalBalance: record.normalBalance || ACCOUNT_TYPES[record.accountType]?.normalBalance || 'Debit',
              });
              setIsModalVisible(true);
            }} />
          </Tooltip>
          <Tooltip title="Duplicate"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(record)} /></Tooltip>
          <Tooltip title={record.status === 'Active' ? 'Deactivate' : 'Activate'}>
            <Button type="text" size="small" onClick={() => handleToggleStatus(record)}
              icon={record.status === 'Active' ? <CloseCircleOutlined style={{ color: '#f5222d' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />} />
          </Tooltip>
          {!record.isSystem && (
            <Popconfirm title="Delete this account?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
              <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  /* ─── Tab content helper ─── */
  const getTabData = (type) => {
    if (type === 'all') return treeView ? treeData : filteredAccounts;
    const subset = filteredAccounts.filter(a => a.accountType === type);
    return treeView ? buildTree(subset) : subset;
  };

  const renderTable = (data) => (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      size="middle"
      rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
      pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} accounts` }}
      scroll={{ x: 1100 }}
      expandable={treeView ? { childrenColumnName: 'children', defaultExpandAllRows: true } : undefined}
    />
  );

  /* ─── Render ─── */
  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <AccountBookOutlined style={{ marginRight: 8 }} />Chart of Accounts
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={loadAccounts} loading={loading} /></Tooltip>
            <Tooltip title="Print"><Button icon={<PrinterOutlined />} onClick={handlePrint} /></Tooltip>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Export CSV</Button>
            <Tooltip title="Seed mandatory system accounts (Accounts Receivable, Accounts Payable, etc.)">
              <Button icon={<SafetyOutlined />} loading={seedLoading} onClick={handleSeedAccounts}>Seed System Accounts</Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditingId(null); setSelectedType(null); form.resetFields();
              form.setFieldsValue({ status: 'Active', openingBalance: 0, normalBalance: 'Debit' });
              setIsModalVisible(true);
            }}>Add Account</Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Total Accounts</Text>
                <Title level={3} style={{ margin: 0 }}>{stats.total || 0}</Title>
              </div>
              <AccountBookOutlined style={{ fontSize: 28, color: '#1890ff', opacity: 0.7 }} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />{stats.active || 0} active
                <span style={{ margin: '0 8px' }}>|</span>
                <CloseCircleOutlined style={{ color: '#f5222d', marginRight: 4 }} />{stats.inactive || 0} inactive
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Total Assets</Text>
                <Title level={3} style={{ margin: 0, color: '#52c41a' }}>{cSym} {fmtNum(stats.totalAssets)}</Title>
              </div>
              <ArrowUpOutlined style={{ fontSize: 28, color: '#52c41a', opacity: 0.7 }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Total Liabilities</Text>
                <Title level={3} style={{ margin: 0, color: '#f5222d' }}>{cSym} {fmtNum(stats.totalLiabilities)}</Title>
              </div>
              <ArrowDownOutlined style={{ fontSize: 28, color: '#f5222d', opacity: 0.7 }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Total Equity</Text>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>{cSym} {fmtNum(stats.totalEquity)}</Title>
              </div>
              <AccountBookOutlined style={{ fontSize: 28, color: '#1890ff', opacity: 0.7 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Accounting Equation Check */}
      <Card size="small" style={{ marginBottom: 20, borderLeft: `4px solid ${Math.abs(stats.balanceCheck || 0) < 0.01 ? '#52c41a' : '#faad14'}` }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space size="large">
              <Text><strong>Assets</strong> {cSym} {fmtNum(stats.totalAssets)}</Text>
              <SwapOutlined />
              <Text><strong>Liabilities</strong> {cSym} {fmtNum(stats.totalLiabilities)}</Text>
              <Text>+</Text>
              <Text><strong>Equity</strong> {cSym} {fmtNum(stats.totalEquity)}</Text>
            </Space>
          </Col>
          <Col>
            {Math.abs(stats.balanceCheck || 0) < 0.01
              ? <Tag color="success" icon={<CheckCircleOutlined />}>Balanced</Tag>
              : <Tag color="warning">Difference: {cSym} {fmtNum(stats.balanceCheck)}</Tag>
            }
          </Col>
        </Row>
      </Card>

      {/* Balance by Type */}
      <Card size="small" style={{ marginBottom: 20 }}>
        <Row gutter={[12, 12]}>
          {Object.entries(stats.byType || {}).filter(([_, b]) => b !== 0 || true).map(([type, balance]) => {
            const cfg = ACCOUNT_TYPES[type] || { color: '#8c8c8c', icon: null };
            const count = (stats.byTypeCount || {})[type] || 0;
            return (
              <Col xs={12} sm={8} md={4} key={type}>
                <div style={{ padding: 10, borderRadius: 6, background: cfg.color + '10', border: `1px solid ${cfg.color}25`, cursor: 'pointer' }}
                  onClick={() => { setFilterType(type); setActiveTab(type); }}>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>{cfg.icon} {type}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: cfg.color }}>{cSym} {fmtNum(balance)}</div>
                  <div style={{ fontSize: 10, color: '#bfbfbf' }}>{count} account{count !== 1 ? 's' : ''}</div>
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* Search, Filter, View Toggle */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={7}>
            <Search placeholder="Search by name, code, or type..." allowClear value={searchText} onChange={e => setSearchText(e.target.value)} />
          </Col>
          <Col xs={12} sm={4}>
            <Select style={{ width: '100%' }} value={filterType} onChange={v => { setFilterType(v); if (v !== 'all') setActiveTab(v); else setActiveTab('all'); }}>
              <Option value="all">All Types</Option>
              {Object.keys(ACCOUNT_TYPES).map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
              <Option value="all">All Status</Option>
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
            </Select>
          </Col>
          <Col xs={24} sm={5}>
            <Space>
              <Tooltip title="Flat list view">
                <Button type={!treeView ? 'primary' : 'default'} icon={<UnorderedListOutlined />} onClick={() => setTreeView(false)} />
              </Tooltip>
              <Tooltip title="Hierarchy tree view">
                <Button type={treeView ? 'primary' : 'default'} icon={<ApartmentOutlined />} onClick={() => setTreeView(true)} />
              </Tooltip>
            </Space>
          </Col>
          <Col xs={24} sm={4}>
            {selectedRowKeys.length > 0 && (
              <Space>
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
                <Button size="small" onClick={() => handleBatchStatus('Active')}>Activate</Button>
                <Button size="small" onClick={() => handleBatchStatus('Inactive')}>Deactivate</Button>
                <Popconfirm title={`Delete ${selectedRowKeys.length} account(s)?`} onConfirm={handleBatchDelete}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      {/* Account List with Tabs */}
      <Card bodyStyle={{ padding: 0 }}>
        <Tabs
          className="gx-tabs-left"
          activeKey={activeTab}
          onChange={handleTabChange}
          destroyInactiveTabPane={true}
          style={{ padding: '0 16px' }}
        >
          <TabPane tab="All" key="all">
            {activeTab === 'all' && renderTable(getTabData('all'))}
          </TabPane>
          <TabPane tab="Asset" key="Asset">
            {activeTab === 'Asset' && renderTable(getTabData('Asset'))}
          </TabPane>
          <TabPane tab="Liability" key="Liability">
            {activeTab === 'Liability' && renderTable(getTabData('Liability'))}
          </TabPane>
          <TabPane tab="Equity" key="Equity">
            {activeTab === 'Equity' && renderTable(getTabData('Equity'))}
          </TabPane>
          <TabPane tab="Income" key="Income">
            {activeTab === 'Income' && renderTable(getTabData('Income'))}
          </TabPane>
          <TabPane tab="Expense" key="Expense">
            {activeTab === 'Expense' && renderTable(getTabData('Expense'))}
          </TabPane>
          <TabPane tab="Bank" key="Bank">
            {activeTab === 'Bank' && renderTable(getTabData('Bank'))}
          </TabPane>
          <TabPane tab="Cash" key="Cash">
            {activeTab === 'Cash' && renderTable(getTabData('Cash'))}
          </TabPane>
          <TabPane tab="COGS" key="Cost of Goods Sold">
            {activeTab === 'Cost of Goods Sold' && renderTable(getTabData('Cost of Goods Sold'))}
          </TabPane>
          <TabPane tab="Other Income" key="Other Income">
            {activeTab === 'Other Income' && renderTable(getTabData('Other Income'))}
          </TabPane>
          <TabPane tab="Other Expense" key="Other Expense">
            {activeTab === 'Other Expense' && renderTable(getTabData('Other Expense'))}
          </TabPane>
        </Tabs>
      </Card>

      {/* ─── Floating Add Account button ─── */}
      <Tooltip title="Add Account" placement="left">
        <Button
          type="primary"
          shape="circle"
          icon={<PlusOutlined />}
          size="large"
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            zIndex: 100,
            width: 48,
            height: 48,
            boxShadow: '0 4px 12px rgba(24,144,255,0.4)',
          }}
          onClick={() => {
            setEditingId(null); setSelectedType(null); form.resetFields();
            form.setFieldsValue({ status: 'Active', openingBalance: 0, normalBalance: 'Debit' });
            setIsModalVisible(true);
          }}
        />
      </Tooltip>

      {/* ─── Add / Edit Modal ─── */}
      <Modal
        title={
          <Space>
            {editingId && accounts.find(a => a.id === editingId)?.isSystem && <LockOutlined style={{ color: '#faad14' }} />}
            {editingId ? 'Edit Account' : 'New Account'}
          </Space>
        }
        visible={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); setEditingId(null); setSelectedType(null); }}
        width={700}
        okText={editingId ? 'Update' : 'Create'}
        destroyOnClose
      >
        {editingId && accounts.find(a => a.id === editingId)?.isSystem && (
          <Alert
            message="System account — name and type are protected. Other fields can be edited."
            type="warning" showIcon icon={<LockOutlined />}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form
          form={form} layout="vertical" onFinish={handleAddEdit}
          initialValues={{ status: 'Active', openingBalance: 0, normalBalance: 'Debit' }}
        >
          {/* Row 1: Type / Sub-Type / Account# */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
            <Form.Item
              name="accountType"
              label={<span>Account Type <Tooltip title="Add new type"><PlusCircleOutlined onClick={() => setAddTypeModalVisible(true)} style={{ color: '#1890ff', cursor: 'pointer', marginLeft: 4 }} /></Tooltip></span>}
              rules={[{ required: true, message: 'Required' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select type" showSearch onChange={(v) => {
                setSelectedType(v);
                setCustomSubTypes([]);
                if (!editingId) form.setFieldsValue({ accountCode: suggestAccountCode(v) });
                form.setFieldsValue({ normalBalance: ACCOUNT_TYPES[v]?.normalBalance || 'Debit', subType: undefined });
              }}>
                {allAccountTypes.map(t => (
                  <Option key={t} value={t}>{ACCOUNT_TYPES[t]?.icon} {t}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="subType"
              label={<span>Sub-Type <Tooltip title="Add new sub-type"><PlusCircleOutlined onClick={() => setAddSubTypeModalVisible(true)} style={{ color: '#1890ff', cursor: 'pointer', marginLeft: 4 }} /></Tooltip></span>}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select sub-type" allowClear showSearch>
                {subTypesForSelected.map(st => (
                  <Option key={st} value={st}>{st}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="accountCode" label="Account #" tooltip="Auto-suggested based on type" style={{ flex: 0.7 }}>
              <Input placeholder="e.g., 1000" />
            </Form.Item>
          </div>

          {/* Row 2: Name / Status */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="accountName" label="Account Name" rules={[{ required: true, message: 'Required' }]} style={{ flex: 2 }}>
              <Input placeholder="e.g., Cash on Hand" />
            </Form.Item>
            <Form.Item name="status" label="Status" style={{ flex: 1 }}>
              <Select>
                <Option value="Active"><Badge status="success" /> Active</Option>
                <Option value="Inactive"><Badge status="default" /> Inactive</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Row 3: Opening Bal / Normal Bal / Tax Line */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="openingBalance" label="Opening Balance" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} />
            </Form.Item>
            <Form.Item name="normalBalance" label="Normal Balance" tooltip="Expenses & Assets increase on Debit side; Income, Liabilities & Equity increase on Credit side" style={{ flex: 1 }}>
              <Select>
                <Option value="Debit">Expenses / Assets (Debit)</Option>
                <Option value="Credit">Income / Liabilities / Equity (Credit)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="taxLine" label="Tax Line" style={{ flex: 1 }}>
              <Input placeholder="e.g., Schedule C Line 10" />
            </Form.Item>
          </div>

          {/* Row 4: Parent Account / Description */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item
              name="parentId"
              label={
                <span>
                  Parent Account
                  <Tooltip title="Create a new parent account">
                    <PlusCircleOutlined
                      onClick={() => {
                        setIsModalVisible(false);
                        setTimeout(() => {
                          setEditingId(null); setSelectedType(null); form.resetFields();
                          form.setFieldsValue({ status: 'Active', openingBalance: 0, normalBalance: 'Debit' });
                          setIsModalVisible(true);
                        }, 50);
                      }}
                      style={{ color: '#1890ff', cursor: 'pointer', marginLeft: 6 }}
                    />
                  </Tooltip>
                </span>
              }
              style={{ flex: 1 }}
            >
              <Select placeholder="(none — top level)" allowClear showSearch optionFilterProp="children">
                {accounts.filter(a => a.id !== editingId && a.status === 'Active').map(a => (
                  <Option key={a.id} value={a.id}>{a.accountCode ? a.accountCode + ' — ' : ''}{a.accountName}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="description" label="Description" style={{ flex: 1 }}>
              <Input placeholder="Brief description (optional)" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ─── Add Account Type Modal ─── */}
      <Modal
        title={<Space><PlusCircleOutlined style={{ color: '#1890ff' }} />Add Account Type</Space>}
        visible={addTypeModalVisible}
        onOk={() => {
          if (!newTypeName.trim()) { message.warning('Please enter a type name'); return; }
          setCustomAccountTypes(p => [...new Set([...p, newTypeName.trim()])]);
          message.success(`Account type "${newTypeName.trim()}" added`);
          setNewTypeName('');
          setAddTypeModalVisible(false);
        }}
        onCancel={() => { setAddTypeModalVisible(false); setNewTypeName(''); }}
        okText="Add Type"
        width={420}
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Account Type Name" required>
            <Input
              placeholder="e.g., Crypto Asset, Investment"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onPressEnter={() => {
                if (!newTypeName.trim()) return;
                setCustomAccountTypes(p => [...new Set([...p, newTypeName.trim()])]);
                message.success(`Account type "${newTypeName.trim()}" added`);
                setNewTypeName('');
                setAddTypeModalVisible(false);
              }}
              autoFocus
              size="large"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              The new type will appear immediately in the Account Type dropdown.
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── Add Sub-Type Modal ─── */}
      <Modal
        title={<Space><PlusCircleOutlined style={{ color: '#1890ff' }} />Add Sub-Type{selectedType ? ` for ${selectedType}` : ''}</Space>}
        visible={addSubTypeModalVisible}
        onOk={() => {
          if (!newSubTypeName.trim()) { message.warning('Please enter a sub-type name'); return; }
          setCustomSubTypes(p => [...new Set([...p, newSubTypeName.trim()])]);
          message.success(`Sub-type "${newSubTypeName.trim()}" added`);
          setNewSubTypeName('');
          setAddSubTypeModalVisible(false);
        }}
        onCancel={() => { setAddSubTypeModalVisible(false); setNewSubTypeName(''); }}
        okText="Add Sub-Type"
        width={420}
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          {!selectedType && (
            <Alert message="Select an Account Type first so the sub-type is linked correctly." type="info" showIcon style={{ marginBottom: 12 }} />
          )}
          <Form.Item label={selectedType ? `Sub-Type Name (for ${selectedType})` : 'Sub-Type Name'} required>
            <Input
              placeholder="e.g., Current Account, Petty Cash"
              value={newSubTypeName}
              onChange={e => setNewSubTypeName(e.target.value)}
              onPressEnter={() => {
                if (!newSubTypeName.trim()) return;
                setCustomSubTypes(p => [...new Set([...p, newSubTypeName.trim()])]);
                message.success(`Sub-type "${newSubTypeName.trim()}" added`);
                setNewSubTypeName('');
                setAddSubTypeModalVisible(false);
              }}
              autoFocus
              size="large"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              The new sub-type will appear immediately in the Sub-Type dropdown.
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── Detail Drawer ─── */}
      <Drawer
        title={drawerAccount ? `${drawerAccount.accountCode || ''} ${drawerAccount.accountName}` : 'Account Details'}
        visible={drawerVisible}
        onClose={() => { setDrawerVisible(false); setDrawerAccount(null); setDrawerTxns([]); }}
        width={560}
        footer={drawerAccount && (
          <Space>
            <Button type="primary" icon={<EditOutlined />} onClick={() => {
              setDrawerVisible(false);
              setEditingId(drawerAccount.id);
              setSelectedType(drawerAccount.accountType);
              form.setFieldsValue({
                ...drawerAccount,
                accountCode: drawerAccount.accountCode || drawerAccount.accountNumber || drawerAccount.number,
                openingBalance: drawerAccount.openingBalance || 0,
                subType: drawerAccount.subType || undefined,
                normalBalance: drawerAccount.normalBalance || ACCOUNT_TYPES[drawerAccount.accountType]?.normalBalance || 'Debit',
              });
              setIsModalVisible(true);
            }}>Edit</Button>
            {!drawerAccount.isSystem && (
              <Button icon={<CopyOutlined />} onClick={() => { setDrawerVisible(false); handleDuplicate(drawerAccount); }}>Duplicate</Button>
            )}
            <Button icon={<PlusOutlined />} onClick={() => {
              setDrawerVisible(false);
              setEditingId(null);
              setSelectedType(drawerAccount.accountType);
              form.resetFields();
              form.setFieldsValue({
                parentId: drawerAccount.id,
                accountType: drawerAccount.accountType,
                accountCode: suggestAccountCode(drawerAccount.accountType),
                normalBalance: ACCOUNT_TYPES[drawerAccount.accountType]?.normalBalance || 'Debit',
                status: 'Active',
                openingBalance: 0,
              });
              setIsModalVisible(true);
            }}>Add Sub-Account</Button>
          </Space>
        )}
      >
        {drawerAccount && (
          <>
            {/* Account info */}
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Account Code">
                <Text code>{drawerAccount.accountCode || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Account Name">
                <Space>
                  {drawerAccount.isSystem && <Tooltip title="System account — protected"><LockOutlined style={{ color: '#faad14' }} /></Tooltip>}
                  <Text strong>{drawerAccount.accountName}</Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                {(() => { const c = ACCOUNT_TYPES[drawerAccount.accountType] || { color: '#8c8c8c', icon: null }; return <Tag color={c.color} icon={c.icon}>{drawerAccount.accountType}</Tag>; })()}
              </Descriptions.Item>
              {drawerAccount.subType && (
                <Descriptions.Item label="Sub-Type"><Text>{drawerAccount.subType}</Text></Descriptions.Item>
              )}
              <Descriptions.Item label="Normal Balance">
                <Tag color={drawerAccount.normalBalance === 'Debit' ? '#108ee9' : '#87d068'}>{drawerAccount.normalBalance || 'Debit'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Balance">
                <Text strong style={{ fontSize: 16, color: drawerAccount.balance >= 0 ? '#52c41a' : '#f5222d' }}>
                  {cSym} {fmtNum(drawerAccount.balance)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Opening Balance">{cSym} {fmtNum(drawerAccount.openingBalance)}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Badge status={drawerAccount.status === 'Active' ? 'success' : 'default'} text={drawerAccount.status} />
              </Descriptions.Item>
              {drawerAccount.taxLine && (
                <Descriptions.Item label="Tax Line"><Text code>{drawerAccount.taxLine}</Text></Descriptions.Item>
              )}
              {drawerAccount.description && (
                <Descriptions.Item label="Description">{drawerAccount.description}</Descriptions.Item>
              )}
              {drawerAccount.parentId && (() => {
                const p = accounts.find(a => a.id === drawerAccount.parentId);
                return p ? <Descriptions.Item label="Parent Account"><ApartmentOutlined /> {p.accountCode} — {p.accountName}</Descriptions.Item> : null;
              })()}
            </Descriptions>

            {/* Sub-accounts */}
            {subAccounts.length > 0 && (
              <>
                <Divider orientation="left">Sub-Accounts ({subAccounts.length})</Divider>
                <Table
                  size="small"
                  dataSource={subAccounts}
                  rowKey="id"
                  pagination={false}
                  onRow={(r) => ({ onClick: () => openDrawer(r), style: { cursor: 'pointer' } })}
                  columns={[
                    { title: 'Code', dataIndex: 'accountCode', width: 80, render: v => <Text code>{v || '-'}</Text> },
                    { title: 'Name', dataIndex: 'accountName' },
                    { title: 'Balance', dataIndex: 'balance', width: 120, align: 'right', render: v => <Text>{cSym} {fmtNum(v)}</Text> },
                    { title: 'Status', dataIndex: 'status', width: 80, render: s => <Badge status={s === 'Active' ? 'success' : 'default'} text={s} /> },
                  ]}
                />
              </>
            )}

            {/* Account Activity */}
            <Divider orientation="left">Account Activity (Journal Entries)</Divider>
            {drawerTxnLoading ? <Spin /> : (
              drawerTxns.length > 0 ? (
                <>
                  <Table
                    size="small"
                    dataSource={drawerTxns.slice(0, 50)}
                    rowKey={(r, i) => r.id || i}
                    pagination={false}
                    summary={(rows) => {
                      const totD = rows.reduce((s, r) => s + (Number(r.debit)  || 0), 0);
                      const totC = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
                      return (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2}><strong>Totals</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right"><strong>{cSym} {fmtNum(totD)}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="right"><strong>{cSym} {fmtNum(totC)}</strong></Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                    columns={[
                      { title: 'Date', dataIndex: 'date', width: 100, render: d => d || '-' },
                      { title: 'Description / Ref', dataIndex: 'description', ellipsis: true,
                        render: (d, r) => <span>{r.reference ? <Text code style={{fontSize:10}}>{r.reference}</Text> : null} {d || r.lineDesc || '-'}</span> },
                      { title: 'Debit',  dataIndex: 'debit',  width: 110, align: 'right', render: v => Number(v) ? <Text style={{color:'#1890ff'}}>{cSym} {fmtNum(v)}</Text> : <Text type="secondary">—</Text> },
                      { title: 'Credit', dataIndex: 'credit', width: 110, align: 'right', render: v => Number(v) ? <Text style={{color:'#52c41a'}}>{cSym} {fmtNum(v)}</Text> : <Text type="secondary">—</Text> },
                    ]}
                  />
                  <div style={{marginTop:8,textAlign:'right'}}>
                    <Text type="secondary" style={{fontSize:11}}>Showing last {Math.min(50, drawerTxns.length)} of {drawerTxns.length} entries</Text>
                  </div>
                </>
              ) : <Empty description="No journal activity recorded for this account" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default ChartOfAccounts;