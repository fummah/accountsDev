import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';

const CustomerList = () => {
  const { symbol: cSym } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();

  const load = useCallback(async (page, pageSize, searchTerm) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(page || 1, pageSize || 25, searchTerm || '');
      if (res && Array.isArray(res.data)) {
        setCustomers(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setCustomers(res);
        setPagination(p => ({ ...p, current: 1, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllCustomers?.();
        setCustomers(Array.isArray(all) ? all : []);
        setPagination(p => ({ ...p, current: 1, total: (all || []).length }));
      }
    } catch {
      message.error('Failed to load customers');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(1, pagination.pageSize, search); }, []);

  const handleTableChange = (pag) => {
    load(pag.current, pag.pageSize, search);
  };

  const handleSearch = () => {
    load(1, pagination.pageSize, search);
  };

  const handleDelete = async (id) => {
    try {
      const res = await window.electronAPI.deleteRecord?.(id, 'customers');
      if (res && res.error) {
        message.error(res.error, 6);
        return;
      }
      if (res && res.success === false) {
        message.error(res.error || 'Delete failed — customer may have linked transactions', 6);
        return;
      }
      message.success('Customer deleted');
      load(pagination.current, pagination.pageSize, search);
    } catch {
      message.error('Delete failed');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (text, record) => (
        <Link to={`/main/customers/details/${record.id}`} style={{ fontWeight: 500 }}>{text || '-'}</Link>
      ),
    },
    { title: 'Company', dataIndex: 'company', key: 'company', responsive: ['md'] },
    { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone', responsive: ['lg'] },
    {
      title: 'Balance',
      dataIndex: 'opening_balance',
      key: 'balance',
      width: 110,
      sorter: (a, b) => (Number(a.opening_balance) || 0) - (Number(b.opening_balance) || 0),
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_, r) => <Tag color={r.status === 'Active' || !r.status ? 'green' : 'default'}>{r.status || 'Active'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />}
            onClick={() => history.push(`/main/customers/details/${record.id}`)}>Edit</Button>
          <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Customers</span>}
        extra={
          <Space>
            <Input.Search
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 240 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => load(1, pagination.pageSize, search)}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => history.push('/main/customers/center')}>
              Add Customer
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100'],
            showTotal: (total) => `${total} customers`,
          }}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};

export default CustomerList;
