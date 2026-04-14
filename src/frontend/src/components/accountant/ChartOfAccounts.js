import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Modal, message, Select, Space, Card, Row, Col,
  Tag, Tooltip, Drawer, Divider, Popconfirm, InputNumber, Tabs, Switch,
  Badge, Descriptions, Empty, Spin, Progress, Typography
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined,
  AccountBookOutlined, DollarOutlined, BankOutlined, WalletOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, EyeOutlined,
  ApartmentOutlined, UnorderedListOutlined, ReloadOutlined, PrinterOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SwapOutlined
} from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Search } = Input;
const { TabPane } = Tabs;
const { Text, Title } = Typography;

/* ─── Account type config ─── */
const ACCOUNT_TYPES = {
  Asset:              { color: '#52c41a', icon: <AccountBookOutlined />, order: 1, range: '1000' },
  Liability:          { color: '#f5222d', icon: <ArrowDownOutlined />,  order: 2, range: '2000' },
  Equity:             { color: '#1890ff', icon: <AccountBookOutlined />, order: 3, range: '3000' },
  Income:             { color: '#13c2c2', icon: <ArrowUpOutlined />,    order: 4, range: '4000' },
  Expense:            { color: '#faad14', icon: <DollarOutlined />,     order: 5, range: '5000' },
  Bank:               { color: '#722ed1', icon: <BankOutlined />,       order: 6, range: '1100' },
  Cash:               { color: '#eb2f96', icon: <WalletOutlined />,     order: 7, range: '1050' },
  'Cost of Goods Sold': { color: '#fa8c16', icon: <DollarOutlined />,   order: 8, range: '5500' },
  'Other Income':     { color: '#52c41a', icon: <ArrowUpOutlined />,    order: 9, range: '4500' },
  'Other Expense':    { color: '#faad14', icon: <DollarOutlined />,     order: 10, range: '6000' },
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

  /* Filters */
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const handleTabChange = (key) => {
    setActiveTab(key);
    setFilterType('all');
  };
  const [treeView, setTreeView] = useState(false);

  /* Batch selection */
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  /* Detail drawer */
  const [drawerAccount, setDrawerAccount] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerTxns, setDrawerTxns] = useState([]);
  const [drawerTxnLoading, setDrawerTxnLoading] = useState(false);

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

  /* ─── Auto-suggest account number ─── */
  const suggestAccountCode = useCallback((type) => {
    if (!type || !ACCOUNT_TYPES[type]) return '';
    const base = Number(ACCOUNT_TYPES[type].range) || 1000;
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
        accountName: values.accountName,
        accountType: values.accountType,
        accountNumber: values.accountCode || '',
        openingBalance: Number(values.openingBalance) || 0,
        status: values.status || 'Active',
        parentId: values.parentId || null,
        description: values.description || '',
      };
      if (editingId) {
        response = await window.electronAPI.updateChartAccount({ id: editingId, ...payload });
      } else {
        response = await window.electronAPI.insertChartAccount(
          payload.accountName, payload.accountType, payload.accountNumber,
          'system', payload.openingBalance, payload.status, payload.parentId, payload.description
        );
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
    const children = accounts.filter(a => a.parentId === id);
    if (children.length) {
      message.warning('Cannot delete: this account has sub-accounts. Reassign them first.');
      return;
    }
    try {
      const response = await window.electronAPI.deleteChartAccount(id);
      if (!response || !response.success) { message.error(response?.message || 'Failed to delete'); return; }
      message.success('Account deleted');
      loadAccounts();
    } catch (error) { message.error(error.message || 'Failed to delete'); }
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
    form.setFieldsValue({
      accountName: (record.accountName || '') + ' (Copy)',
      accountType: record.accountType,
      accountCode: suggestAccountCode(record.accountType),
      description: record.description,
      openingBalance: 0,
      parentId: record.parentId,
      status: 'Active',
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
      ['Account Code', 'Account Name', 'Type', 'Balance', 'Opening Balance', 'Status', 'Parent', 'Description'],
      ...filteredAccounts.map(a => {
        const parent = a.parentId ? accounts.find(p => p.id === a.parentId) : null;
        return [
          csvEscape(a.accountCode), csvEscape(a.accountName), csvEscape(a.accountType),
          a.balance.toFixed(2), (a.openingBalance || 0).toFixed(2), csvEscape(a.status),
          csvEscape(parent ? parent.accountName : ''), csvEscape(a.description),
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
      <thead><tr style="background:#f0f0f0"><th>Code</th><th>Name</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody>${filteredAccounts.map(a => `<tr>
        <td style="font-family:monospace">${a.accountCode || '-'}</td>
        <td>${a.accountName || '-'}</td>
        <td>${a.accountType || '-'}</td>
        <td style="text-align:right">${cSym} ${a.balance.toFixed(2)}</td>
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
    setDrawerTxnLoading(true);
    try {
      const txns = await window.electronAPI?.getAccountTransactions?.(record.id);
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
      width: 100,
      render: (_, record) => (
        <Text code style={{ fontSize: 13 }}>
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
            <a onClick={() => openDrawer(record)} style={{ fontWeight: 500 }}>{text || '-'}</a>
            {parent && (
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                <ApartmentOutlined style={{ marginRight: 4 }} />{parent.accountName}
              </div>
            )}
            {record.description && (
              <div style={{ fontSize: 11, color: '#bfbfbf' }}>{record.description}</div>
            )}
          </div>
        );
      },
      sorter: (a, b) => (a.accountName || '').localeCompare(b.accountName || ''),
    },
    {
      title: 'Type',
      dataIndex: 'accountType',
      key: 'accountType',
      width: 160,
      filters: Object.keys(ACCOUNT_TYPES).map(t => ({ text: t, value: t })),
      onFilter: (value, record) => record.accountType === value,
      render: (text) => {
        const cfg = ACCOUNT_TYPES[text] || { color: '#8c8c8c', icon: null };
        return <Tag color={cfg.color} icon={cfg.icon}>{text || '-'}</Tag>;
      },
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
      width: 170,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDrawer(record)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => {
            setEditingId(record.id);
            form.setFieldsValue({
              ...record,
              accountCode: record.accountCode || record.accountNumber || record.number,
              openingBalance: record.openingBalance || 0,
            });
            setIsModalVisible(true);
          }} /></Tooltip>
          <Tooltip title="Duplicate"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(record)} /></Tooltip>
          <Tooltip title={record.status === 'Active' ? 'Deactivate' : 'Activate'}>
            <Button type="text" size="small" onClick={() => handleToggleStatus(record)}
              icon={record.status === 'Active' ? <CloseCircleOutlined style={{ color: '#f5222d' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />} />
          </Tooltip>
          <Popconfirm title="Delete this account?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
            <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
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
          <Space>
            <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={loadAccounts} loading={loading} /></Tooltip>
            <Tooltip title="Print"><Button icon={<PrinterOutlined />} onClick={handlePrint} /></Tooltip>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Export CSV</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setIsModalVisible(true); }}>
              Add Account
            </Button>
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

      {/* ─── Add / Edit Modal ─── */}
      <Modal
        title={editingId ? 'Edit Account' : 'Add New Account'}
        visible={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); setEditingId(null); }}
        width={640}
        okText={editingId ? 'Update' : 'Create'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleAddEdit} initialValues={{ status: 'Active', openingBalance: 0 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="accountType" label="Account Type" rules={[{ required: true, message: 'Required' }]}>
                <Select placeholder="Select type" onChange={(v) => {
                  if (!editingId) form.setFieldsValue({ accountCode: suggestAccountCode(v) });
                }}>
                  {Object.keys(ACCOUNT_TYPES).map(t => (
                    <Option key={t} value={t}>{ACCOUNT_TYPES[t].icon} {t}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="accountCode" label="Account Code" tooltip="Auto-suggested based on type, editable">
                <Input placeholder="e.g., 1000" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="accountName" label="Account Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g., Cash on Hand" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Brief description..." />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="openingBalance" label="Opening Balance">
                <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="parentId" label="Parent Account">
                <Select placeholder="(none)" allowClear showSearch optionFilterProp="children">
                  {accounts.filter(a => a.id !== editingId && a.status === 'Active').map(a => (
                    <Option key={a.id} value={a.id}>{a.accountCode ? a.accountCode + ' - ' : ''}{a.accountName}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status">
                <Select>
                  <Option value="Active"><Badge status="success" /> Active</Option>
                  <Option value="Inactive"><Badge status="default" /> Inactive</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
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
              form.setFieldsValue({
                ...drawerAccount,
                accountCode: drawerAccount.accountCode || drawerAccount.accountNumber || drawerAccount.number,
                openingBalance: drawerAccount.openingBalance || 0,
              });
              setIsModalVisible(true);
            }}>Edit</Button>
            <Button icon={<CopyOutlined />} onClick={() => { setDrawerVisible(false); handleDuplicate(drawerAccount); }}>Duplicate</Button>
            <Button icon={<PlusOutlined />} onClick={() => {
              setDrawerVisible(false);
              setEditingId(null);
              form.resetFields();
              form.setFieldsValue({
                parentId: drawerAccount.id,
                accountType: drawerAccount.accountType,
                accountCode: suggestAccountCode(drawerAccount.accountType),
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
                <Text strong>{drawerAccount.accountName}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                {(() => { const c = ACCOUNT_TYPES[drawerAccount.accountType] || { color: '#8c8c8c', icon: null }; return <Tag color={c.color} icon={c.icon}>{drawerAccount.accountType}</Tag>; })()}
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
              {drawerAccount.description && (
                <Descriptions.Item label="Description">{drawerAccount.description}</Descriptions.Item>
              )}
              {drawerAccount.parentId && (() => {
                const p = accounts.find(a => a.id === drawerAccount.parentId);
                return p ? <Descriptions.Item label="Parent Account"><ApartmentOutlined /> {p.accountCode} - {p.accountName}</Descriptions.Item> : null;
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

            {/* Recent Transactions */}
            <Divider orientation="left">Recent Transactions</Divider>
            {drawerTxnLoading ? <Spin /> : (
              drawerTxns.length > 0 ? (
                <Table
                  size="small"
                  dataSource={drawerTxns.slice(0, 20)}
                  rowKey={(r, i) => r.id || i}
                  pagination={false}
                  columns={[
                    { title: 'Date', dataIndex: 'date', width: 100, render: d => d || '-' },
                    { title: 'Description', dataIndex: 'description', ellipsis: true },
                    { title: 'Debit', dataIndex: 'debit', width: 100, align: 'right', render: v => v ? `${cSym} ${fmtNum(v)}` : '-' },
                    { title: 'Credit', dataIndex: 'credit', width: 100, align: 'right', render: v => v ? `${cSym} ${fmtNum(v)}` : '-' },
                  ]}
                />
              ) : <Empty description="No transactions recorded for this account" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default ChartOfAccounts;