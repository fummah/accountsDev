import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, Select, message, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, PrinterOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';

const statusColors = { Paid: 'green', Unpaid: 'orange', Sent: 'blue', Overdue: 'red', Draft: 'default', Void: 'volcano' };

const InvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();

  const load = useCallback(async (page, pageSize, searchTerm, status) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getInvoicesPaginated?.(page || 1, pageSize || 25, searchTerm || '', status || '');
      if (res && Array.isArray(res.data)) {
        setInvoices(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setInvoices(res);
        setPagination(p => ({ ...p, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllInvoices?.();
        const arr = Array.isArray(all) ? all : [];
        setInvoices(arr);
        setPagination(p => ({ ...p, total: arr.length }));
      }
    } catch {
      message.error('Failed to load invoices');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(1, pagination.pageSize, search, statusFilter); }, []);

  const handleTableChange = (pag) => load(pag.current, pag.pageSize, search, statusFilter);
  const handleSearch = () => load(1, pagination.pageSize, search, statusFilter);
  const handleStatusChange = (v) => { setStatusFilter(v || ''); load(1, pagination.pageSize, search, v || ''); };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteRecord?.(id, 'invoices');
      message.success('Invoice deleted');
      load(pagination.current, pagination.pageSize, search, statusFilter);
    } catch { message.error('Delete failed'); }
  };

  const totalAmount = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const unpaidAmount = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Sent').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidCount = invoices.filter(i => i.status === 'Paid').length;

  const columns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number', width: 100,
      sorter: (a, b) => String(a.number || '').localeCompare(String(b.number || '')),
      render: (t, r) => <Link to={`/main/customers/invoices/edit/${r.id}`} style={{ fontWeight: 500 }}>{t || `INV-${r.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer',
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (t, r) => t || r.customer || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      sorter: (a, b) => (a.start_date || '').localeCompare(b.start_date || ''),
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'last_date', key: 'due', width: 100,
      render: (d, r) => {
        const isOverdue = (r.status === 'Unpaid' || r.status === 'Sent') && d && moment(d).isBefore(moment());
        return <span style={{ color: isOverdue ? '#f5222d' : undefined, fontWeight: isOverdue ? 600 : undefined }}>
          {d ? moment(d).format('DD/MM/YYYY') : '-'}
        </span>;
      }},
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 110,
      sorter: (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0),
      render: v => <span style={{ fontWeight: 500 }}>R {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90,
      filters: Object.keys(statusColors).map(s => ({ text: s, value: s })),
      onFilter: (v, r) => r.status === v,
      render: s => <Tag color={statusColors[s] || 'default'}>{s || 'Draft'}</Tag> },
    { title: 'Actions', key: 'actions', width: 140,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => history.push(`/main/customers/invoices/edit/${r.id}`)} />
          <Popconfirm title="Delete this invoice?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="Total Invoiced" value={totalAmount.toFixed(2)} prefix="R" /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Unpaid" value={unpaidAmount.toFixed(2)} prefix="R" valueStyle={{ color: unpaidAmount > 0 ? '#faad14' : '#52c41a' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Paid" value={paidCount} suffix={`/ ${invoices.length}`} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Invoices</span>}
        extra={
          <Space>
            <Input.Search placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              onSearch={handleSearch} style={{ width: 200 }} allowClear />
            <Select placeholder="Status" allowClear style={{ width: 120 }} value={statusFilter || undefined} onChange={handleStatusChange}>
              {Object.keys(statusColors).map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => load(1, pagination.pageSize, search, statusFilter)} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/invoices/new')}>
              New Invoice
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={invoices}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} invoices` }}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};

export default InvoiceList;
