import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Space, Typography, Tag, Modal, Input, message, Select, DatePicker, Popconfirm } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ApprovalsCenter = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [entityFilter, setEntityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const filter = {};
      if (statusFilter && statusFilter !== 'ALL') filter.status = statusFilter;
      if (entityFilter) filter.entityType = entityFilter;
      const data = await window.electronAPI.approvalsList(filter);
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, entityFilter]);

  const doAction = async (type, id) => {
    try {
      setLoading(true);
      if (type === 'approve') {
        await window.electronAPI.approvalApprove({ id, approverId: 'current', comment });
        message.success('Approved');
      } else {
        await window.electronAPI.approvalReject({ id, approverId: 'current', comment });
        message.success('Rejected');
      }
      setComment('');
      setSelectedId(null);
      load();
    } finally {
      setLoading(false);
    }
  };

  const bulkAction = async (type) => {
    if (!selectedRowKeys.length) return;
    try {
      setLoading(true);
      for (const id of selectedRowKeys) {
        // eslint-disable-next-line no-await-in-loop
        if (type === 'approve') {
          await window.electronAPI.approvalApprove({ id, approverId: 'current', comment: '' });
        } else {
          await window.electronAPI.approvalReject({ id, approverId: 'current', comment: '' });
        }
      }
      message.success(`${type === 'approve' ? 'Approved' : 'Rejected'} ${selectedRowKeys.length} item(s)`);
      setSelectedRowKeys([]);
      load();
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let ds = rows;
    if (search) {
      const q = search.toLowerCase();
      ds = ds.filter(r =>
        String(r.entityType || '').toLowerCase().includes(q) ||
        String(r.entityId || '').toLowerCase().includes(q) ||
        String(r.requestedBy || '').toLowerCase().includes(q) ||
        String(r.lastComment || '').toLowerCase().includes(q)
      );
    }
    if (range && range.length === 2 && range[0] && range[1]) {
      const [start, end] = range;
      ds = ds.filter(r => {
        const d = r.requestedAt ? dayjs(r.requestedAt) : null;
        return d && d.isAfter(start.startOf('day')) && d.isBefore(end.endOf('day'));
      });
    }
    return ds;
  }, [rows, search, range]);

  const columns = [
    { title: 'Entity', dataIndex: 'entityType', key: 'entityType' },
    { title: 'Entity ID', dataIndex: 'entityId', key: 'entityId' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => (v != null ? Number(v).toFixed(2) : '') },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={v === 'PENDING' ? 'orange' : v === 'APPROVED' ? 'green' : 'red'}>{v}</Tag> },
    { title: 'Level', dataIndex: 'level', key: 'level', render: (v, r) => <Text>{v}/{r.requiredLevels}</Text> },
    { title: 'Requested By', dataIndex: 'requestedBy', key: 'requestedBy' },
    { title: 'Requested At', dataIndex: 'requestedAt', key: 'requestedAt', render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '' },
    { title: 'Last Action By', dataIndex: 'lastActionBy', key: 'lastActionBy' },
    { title: 'Last Action At', dataIndex: 'lastActionAt', key: 'lastActionAt', render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '' },
    { title: 'Last Comment', dataIndex: 'lastComment', key: 'lastComment', ellipsis: true },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" type="primary" onClick={() => { setSelectedId(r.id); }}>Act</Button>
        </Space>
      )
    }
  ];

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>Approvals Center</Title>
          <Space>
            <Button onClick={() => { window.location.hash = '#/main/settings/approval-policies'; }}>Manage Policies</Button>
            <Button type="primary" onClick={() => { window.location.hash = '#/main/expenses/transactions'; }}>Create Expense (with Approval)</Button>
          </Space>
        </Space>
        <Space wrap style={{ width: '100%' }}>
          <Select
            value={statusFilter}
            style={{ minWidth: 160 }}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
          />
          <Select
            value={entityFilter}
            style={{ minWidth: 180 }}
            placeholder="All entity types"
            onChange={setEntityFilter}
            allowClear
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'invoice', label: 'Invoice' },
              { value: 'purchase', label: 'Purchase' },
            ]}
          />
          <RangePicker value={range} onChange={setRange} />
          <Input.Search
            placeholder="Search entity, requester, comment"
            allowClear
            onSearch={setSearch}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 280 }}
          />
          <Button onClick={load} loading={loading}>Refresh</Button>
          <Popconfirm title="Approve selected?" onConfirm={() => bulkAction('approve')} okText="Approve" cancelText="Cancel" disabled={!selectedRowKeys.length}>
            <Button type="primary" disabled={!selectedRowKeys.length}>Bulk Approve</Button>
          </Popconfirm>
          <Popconfirm title="Reject selected?" onConfirm={() => bulkAction('reject')} okText="Reject" cancelText="Cancel" disabled={!selectedRowKeys.length}>
            <Button danger disabled={!selectedRowKeys.length}>Bulk Reject</Button>
          </Popconfirm>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ pageSize: 10 }}
        />
      </Space>

      <Modal
        title="Approval Action"
        open={!!selectedId}
        onCancel={() => { setSelectedId(null); setComment(''); }}
        footer={[
          <Button key="reject" danger onClick={() => doAction('reject', selectedId)} disabled={!selectedId}>Reject</Button>,
          <Button key="approve" type="primary" onClick={() => doAction('approve', selectedId)} disabled={!selectedId}>Approve</Button>
        ]}
      >
        <Input.TextArea rows={4} placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </Card>
  );
};

export default ApprovalsCenter;


