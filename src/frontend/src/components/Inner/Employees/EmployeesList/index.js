import React, { useState, useMemo } from 'react';
import { Table, Col, Row, Input, Tag, Button, Space, Drawer, Card, Divider, Avatar, Statistic, Descriptions, Popconfirm, Tooltip, Progress, Badge } from 'antd';
import { SearchOutlined, PrinterOutlined, EyeOutlined, EditOutlined, DeleteOutlined, UserOutlined, MailOutlined, PhoneOutlined, HomeOutlined, CalendarOutlined, DollarOutlined, SafetyCertificateOutlined, TeamOutlined, CopyOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../../utils/currency';

const formattedNumber = (number) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number || 0);

const STATUS_MAP = {
  Active:      { color: 'green',   label: 'Active' },
  Activate:    { color: 'green',   label: 'Active' },
  active:      { color: 'green',   label: 'Active' },
  Deactivated: { color: 'red',     label: 'Deactivated' },
  deactivated: { color: 'red',     label: 'Deactivated' },
  Inactive:    { color: 'default', label: 'Inactive' },
  inactive:    { color: 'default', label: 'Inactive' },
  Suspended:   { color: 'orange',  label: 'Suspended' },
  suspended:   { color: 'orange',  label: 'Suspended' },
  Probation:   { color: 'gold',    label: 'Probation' },
  probation:   { color: 'gold',    label: 'Probation' },
  Terminated:  { color: 'volcano', label: 'Terminated' },
  terminated:  { color: 'volcano', label: 'Terminated' },
  'On Leave':  { color: 'blue',    label: 'On Leave' },
};

const getStatusTag = (status) => {
  const s = STATUS_MAP[status] || { color: 'default', label: status || 'Unknown' };
  return <Tag color={s.color}>{s.label}</Tag>;
};

const getInitials = (rec) => {
  const f = (rec.first_name || '').charAt(0).toUpperCase();
  const l = (rec.last_name || '').charAt(0).toUpperCase();
  return f + l || '?';
};

const getTenure = (dateHired) => {
  if (!dateHired) return '-';
  const d = moment(dateHired);
  if (!d.isValid()) return '-';
  const years = moment().diff(d, 'years');
  const months = moment().diff(d, 'months') % 12;
  if (years > 0) return `${years}y ${months}m`;
  return `${months}m`;
};

const EmployeesList = ({
  employees,
  loading = false,
  total = 0,
  page = 1,
  pageSize = 25,
  onTableChange,
  onSearch,
  onSelectEmployee,
  setAddUserState,
  onDelete
}) => {
  const { symbol: cSym } = useCurrency();
  const [searchInput, setSearchInput] = useState('');
  const [viewEmployee, setViewEmployee] = useState(null);

  const statusCounts = useMemo(() => {
    const counts = { active: 0, inactive: 0, total: (employees || []).length };
    (employees || []).forEach(e => {
      const s = (e.status || '').toLowerCase();
      if (s === 'active' || s === 'activate') counts.active++;
      else counts.inactive++;
    });
    return counts;
  }, [employees]);

  const columns = [
    {
      title: 'Employee',
      key: 'name',
      sorter: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={36} style={{ background: '#1890ff', fontWeight: 600, flexShrink: 0 }}>{getInitials(record)}</Avatar>
          <div>
            <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{record.first_name} {record.mi ? record.mi + ' ' : ''}{record.last_name}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{record.email || '-'}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: v => v || <span style={{ color: '#bfbfbf' }}>-</span>,
      responsive: ['md'],
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: v => v ? <Tag>{v}</Tag> : <span style={{ color: '#bfbfbf' }}>Staff</span>,
      responsive: ['lg'],
    },
    {
      title: 'Date Hired',
      dataIndex: 'date_hired',
      key: 'date_hired',
      sorter: (a, b) => (a.date_hired || '').localeCompare(b.date_hired || ''),
      render: v => v ? moment(v).format('DD/MM/YYYY') : '-',
      responsive: ['md'],
    },
    {
      title: 'Salary',
      dataIndex: 'salary',
      key: 'salary',
      sorter: (a, b) => Number(a.salary || 0) - Number(b.salary || 0),
      align: 'right',
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {formattedNumber(v)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: Object.entries(STATUS_MAP).filter(([k]) => k.charAt(0) === k.charAt(0).toUpperCase()).map(([k, v]) => ({ text: v.label, value: k })),
      onFilter: (value, record) => (record.status || '').toLowerCase() === value.toLowerCase(),
      render: v => getStatusTag(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); setViewEmployee(record); }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onSelectEmployee(record); setAddUserState(true); }} />
          </Tooltip>
          <Popconfirm title="Delete this employee?" okText="Yes" cancelText="No" onConfirm={(e) => { onDelete(record.id); }} onCancel={(e) => {}}>
            <Tooltip title="Delete">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(() => {}).catch(() => {});
  };

  return (
    <>
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Input
            placeholder="Search employees..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={() => typeof onSearch === 'function' && onSearch(searchInput)}
            onBlur={() => { if (!searchInput && typeof onSearch === 'function') onSearch(''); }}
          />
        </Col>
        <Col xs={24} sm={16} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <Tag color="green">{statusCounts.active} Active</Tag>
          <Tag color="default">{statusCounts.inactive} Inactive</Tag>
          <Tag>{statusCounts.total} Total</Tag>
          <Tooltip title="Print">
            <PrinterOutlined style={{ fontSize: 20, cursor: 'pointer', color: '#595959' }} onClick={() => window.print()} />
          </Tooltip>
        </Col>
      </Row>

      <div className="gx-table-responsive">
        <Table
          className="gx-table-no-bordered"
          columns={columns}
          dataSource={employees || []}
          loading={loading}
          pagination={
            typeof onTableChange === 'function'
              ? {
                  current: page,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '25', '50', '100'],
                  showTotal: (t) => `Total ${t} employees`,
                  onChange: (p, size) => onTableChange(p, size),
                }
              : true
          }
          size="small"
          rowKey="id"
          onRow={(record) => ({
            onClick: () => setViewEmployee(record),
            style: { cursor: 'pointer', transition: 'background-color 0.2s' },
          })}
        />
      </div>

      {/* View Details Drawer */}
      <Drawer
        title={viewEmployee ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} style={{ background: '#1890ff', fontWeight: 700, fontSize: 16 }}>{viewEmployee ? getInitials(viewEmployee) : ''}</Avatar>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{viewEmployee.first_name} {viewEmployee.mi ? viewEmployee.mi + ' ' : ''}{viewEmployee.last_name}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>{viewEmployee.role || 'Staff'} {viewEmployee.department ? `· ${viewEmployee.department}` : ''}</div>
            </div>
          </div>
        ) : 'Employee Details'}
        width={520}
        visible={!!viewEmployee}
        onClose={() => setViewEmployee(null)}
        destroyOnClose
      >
        {viewEmployee && (
          <div>
            {/* Status & Quick Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              {getStatusTag(viewEmployee.status)}
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>ID: #{viewEmployee.id}</span>
            </div>

            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
              <Col span={8}>
                <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #1890ff' }}>
                  <Statistic title="Salary" value={viewEmployee.salary || 0} prefix={cSym} precision={2} valueStyle={{ fontSize: 16, color: '#1890ff' }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #52c41a' }}>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>Tenure</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#52c41a' }}>{getTenure(viewEmployee.date_hired)}</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #722ed1' }}>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>Role</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#722ed1' }}>{viewEmployee.role || 'Staff'}</div>
                </Card>
              </Col>
            </Row>

            {/* Contact Information */}
            <Card size="small" title={<span style={{ fontSize: 13 }}><UserOutlined style={{ marginRight: 6 }} />Contact Information</span>} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><MailOutlined style={{ marginRight: 8, color: '#1890ff' }} />{viewEmployee.email || '-'}</span>
                  {viewEmployee.email && <Tooltip title="Copy"><CopyOutlined style={{ cursor: 'pointer', color: '#bfbfbf' }} onClick={() => copyToClipboard(viewEmployee.email)} /></Tooltip>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><PhoneOutlined style={{ marginRight: 8, color: '#52c41a' }} />{viewEmployee.phone || '-'}</span>
                  {viewEmployee.phone && <Tooltip title="Copy"><CopyOutlined style={{ cursor: 'pointer', color: '#bfbfbf' }} onClick={() => copyToClipboard(viewEmployee.phone)} /></Tooltip>}
                </div>
                <div><HomeOutlined style={{ marginRight: 8, color: '#fa8c16' }} />{viewEmployee.address || '-'}</div>
              </div>
            </Card>

            {/* Employment Details */}
            <Card size="small" title={<span style={{ fontSize: 13 }}><SafetyCertificateOutlined style={{ marginRight: 6 }} />Employment Details</span>} style={{ marginBottom: 16 }}>
              <Descriptions column={2} size="small" labelStyle={{ color: '#8c8c8c', fontSize: 12 }} contentStyle={{ fontWeight: 500 }}>
                <Descriptions.Item label="Hire Date">{viewEmployee.date_hired ? moment(viewEmployee.date_hired).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
                <Descriptions.Item label="Department">{viewEmployee.department || '-'}</Descriptions.Item>
                <Descriptions.Item label="Position">{viewEmployee.position || viewEmployee.role || 'Staff'}</Descriptions.Item>
                <Descriptions.Item label="Status">{getStatusTag(viewEmployee.status)}</Descriptions.Item>
                <Descriptions.Item label="Monthly Salary" span={2}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{cSym} {formattedNumber(viewEmployee.salary)}</span>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Permissions */}
            {viewEmployee.permissions && (() => {
              try {
                const perms = typeof viewEmployee.permissions === 'string' ? JSON.parse(viewEmployee.permissions) : viewEmployee.permissions;
                if (Array.isArray(perms) && perms.length > 0) {
                  return (
                    <Card size="small" title={<span style={{ fontSize: 13 }}><TeamOutlined style={{ marginRight: 6 }} />Permissions</span>} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {perms.map(p => <Tag key={p} color="blue" style={{ textTransform: 'capitalize' }}>{p}</Tag>)}
                      </div>
                    </Card>
                  );
                }
              } catch { /* ignore */ }
              return null;
            })()}

            {/* Record Info */}
            <div style={{ fontSize: 11, color: '#bfbfbf', marginBottom: 16 }}>
              <CalendarOutlined style={{ marginRight: 4 }} />
              Record created: {viewEmployee.date_entered || '-'}
              {viewEmployee.entered_by ? ` · By: ${viewEmployee.entered_by}` : ''}
            </div>

            <Divider />

            {/* Quick Actions */}
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block type="primary" icon={<EditOutlined />} onClick={() => { setViewEmployee(null); onSelectEmployee(viewEmployee); setAddUserState(true); }}>
                Edit Employee
              </Button>
              <Popconfirm title="Are you sure you want to delete this employee?" okText="Yes" cancelText="No" onConfirm={() => { onDelete(viewEmployee.id); setViewEmployee(null); }}>
                <Button block danger icon={<DeleteOutlined />}>Delete Employee</Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Drawer>
    </>
  );
};

export default EmployeesList;
