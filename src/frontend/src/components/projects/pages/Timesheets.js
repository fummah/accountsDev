import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, Table, Select, DatePicker, InputNumber, Input, Button, Row, Col, Statistic, Space, Tag, Tooltip, Popconfirm, Typography, message, Progress } from 'antd';
import { ClockCircleOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined, CalendarOutlined, DollarOutlined, ProjectOutlined, FieldTimeOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;
const { Text, Title } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Timesheets = () => {
  const { symbol: cSym } = useCurrency();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workDate, setWorkDate] = useState(null);
  const [hours, setHours] = useState(null);
  const [rate, setRate] = useState(null);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const list = await window.electronAPI.getProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch { setProjects([]); }
  }, []);

  const load = useCallback(async () => {
    if (!projectId) { setEntries([]); return; }
    try {
      setLoading(true);
      const list = await window.electronAPI.listTimesheetsByProject(Number(projectId));
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error(String(e?.message || 'Failed to load timesheets'));
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!projectId) { message.warning('Select a project first'); return; }
    if (!workDate) { message.warning('Select a date'); return; }
    if (!hours || hours <= 0) { message.warning('Enter valid hours'); return; }
    try {
      setAdding(true);
      await window.electronAPI.logTime({
        projectId: Number(projectId),
        workDate: workDate.format('YYYY-MM-DD'),
        hours: Number(hours),
        hourlyRate: rate ? Number(rate) : 0,
        notes
      });
      message.success(`Logged ${hours}h successfully`);
      setWorkDate(null); setHours(null); setRate(null); setNotes('');
      await load();
    } catch (e) {
      message.error(String(e?.message || 'Failed to log time'));
    } finally { setAdding(false); }
  };

  const remove = async (id) => {
    try {
      await window.electronAPI.deleteTimesheet(id);
      message.success('Entry deleted');
      await load();
    } catch (e) {
      message.error(String(e?.message || 'Failed to delete'));
    }
  };

  const totals = useMemo(() => entries.reduce((acc, e) => {
    acc.hours += Number(e.hours || 0);
    acc.amount += Number(e.amount || 0);
    return acc;
  }, { hours: 0, amount: 0 }), [entries]);

  const thisWeekHours = useMemo(() => {
    const weekStart = moment().startOf('isoWeek');
    return entries.filter(e => e.workDate && moment(e.workDate).isSameOrAfter(weekStart))
      .reduce((s, e) => s + Number(e.hours || 0), 0);
  }, [entries]);

  const avgRate = useMemo(() => {
    const ratedEntries = entries.filter(e => Number(e.hourlyRate) > 0);
    if (!ratedEntries.length) return 0;
    return ratedEntries.reduce((s, e) => s + Number(e.hourlyRate || 0), 0) / ratedEntries.length;
  }, [entries]);

  const selectedProject = useMemo(() => projects.find(p => String(p.id) === String(projectId)), [projects, projectId]);

  const exportCSV = () => {
    try {
      const headers = ['Date', 'Hours', 'Rate', 'Amount', 'Notes'];
      const rows = entries.map(e => [
        e.workDate || '', Number(e.hours || 0).toFixed(2), Number(e.hourlyRate || 0).toFixed(2),
        Number(e.amount || 0).toFixed(2), (e.notes || '').replace(/"/g, '""')
      ].map(v => `"${v}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `timesheet_${selectedProject?.name || projectId}_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      message.success('Exported CSV');
    } catch { message.error('Export failed'); }
  };

  const columns = [
    {
      title: 'Date', dataIndex: 'workDate', key: 'workDate', width: 120,
      sorter: (a, b) => (a.workDate || '').localeCompare(b.workDate || ''),
      render: v => v ? (
        <span>
          <CalendarOutlined style={{ marginRight: 6, color: '#1890ff' }} />
          {moment(v).format('ddd, DD MMM')}
        </span>
      ) : '-',
    },
    {
      title: 'Hours', dataIndex: 'hours', key: 'hours', width: 100, align: 'center',
      sorter: (a, b) => Number(a.hours || 0) - Number(b.hours || 0),
      render: v => {
        const h = Number(v || 0);
        const color = h >= 8 ? '#52c41a' : h >= 4 ? '#fa8c16' : '#ff4d4f';
        return <Tag color={color} style={{ fontWeight: 600, fontSize: 13 }}>{h.toFixed(1)}h</Tag>;
      },
    },
    {
      title: 'Rate', dataIndex: 'hourlyRate', key: 'hourlyRate', width: 100, align: 'right',
      render: v => Number(v) > 0 ? <Text>{cSym} {fmt(v)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: v => Number(v) > 0 ? <Text strong style={{ color: '#52c41a' }}>{cSym} {fmt(v)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true,
      render: v => v || <Text type="secondary" style={{ fontStyle: 'italic' }}>No notes</Text>,
    },
    {
      title: '', key: 'actions', width: 50, align: 'center',
      render: (_, record) => (
        <Popconfirm title="Delete this entry?" okText="Yes" cancelText="No" onConfirm={() => remove(record.id)}>
          <Tooltip title="Delete">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ClockCircleOutlined style={{ marginRight: 8 }} />Time Tracking</Title>
          <Text type="secondary">Log and manage project hours</Text>
        </div>
        <Select
          showSearch
          optionFilterProp="children"
          placeholder="Select Project"
          value={projectId}
          onChange={setProjectId}
          style={{ minWidth: 240 }}
          allowClear
          suffixIcon={<ProjectOutlined />}
        >
          {projects.map(p => <Option key={p.id} value={String(p.id)}>{p.name}</Option>)}
        </Select>
      </div>

      {/* Stats Cards */}
      {projectId && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
              <Statistic title="Total Hours" value={totals.hours} precision={1} suffix="h" valueStyle={{ fontSize: 18, color: '#1890ff' }} prefix={<ClockCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
              <Statistic title="Total Amount" value={totals.amount} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
              <Statistic title="This Week" value={thisWeekHours} precision={1} suffix="h" valueStyle={{ fontSize: 18, color: '#722ed1' }} />
              <Progress percent={Math.min(100, (thisWeekHours / 40) * 100)} size="small" showInfo={false} strokeColor="#722ed1" style={{ marginTop: 4 }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
              <Statistic title="Avg Rate" value={avgRate} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Log Time Form */}
      {projectId && (
        <Card size="small" title={<><FieldTimeOutlined style={{ marginRight: 4 }} /> Log Time</>} style={{ marginBottom: 16 }}>
          <Row gutter={12} align="bottom">
            <Col xs={24} sm={5}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>Date</div>
              <DatePicker value={workDate} onChange={setWorkDate} style={{ width: '100%' }} />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>Hours</div>
              <InputNumber value={hours} onChange={setHours} min={0.25} max={24} step={0.25} style={{ width: '100%' }} placeholder="0.0" />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>Hourly Rate</div>
              <InputNumber value={rate} onChange={setRate} min={0} step={10} style={{ width: '100%' }} placeholder="0.00" formatter={v => v ? `${cSym} ${v}` : ''} parser={v => v.replace(new RegExp(`${cSym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'g'), '')} />
            </Col>
            <Col xs={24} sm={7}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>Notes</div>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you work on?" onPressEnter={add} />
            </Col>
            <Col xs={24} sm={4}>
              <Button type="primary" icon={<PlusOutlined />} onClick={add} loading={adding} block>Log Time</Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Entries Table */}
      {projectId && (
        <Card size="small"
          title={<><CalendarOutlined style={{ marginRight: 4 }} /> Entries {entries.length > 0 && <Tag>{entries.length}</Tag>}</>}
          extra={entries.length > 0 && <Button icon={<DownloadOutlined />} onClick={exportCSV} size="small">CSV</Button>}
        >
          <Table
            columns={columns}
            dataSource={entries}
            rowKey="id"
            size="small"
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} entries` }}
            locale={{ emptyText: 'No time entries yet. Log your first hours above!' }}
            summary={() => entries.length > 0 ? (
              <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
                <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center"><Tag color="blue" style={{ fontWeight: 700 }}>{totals.hours.toFixed(1)}h</Tag></Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#52c41a' }}>{cSym} {fmt(totals.amount)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            ) : null}
          />
        </Card>
      )}

      {/* Empty State */}
      {!projectId && (
        <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
          <ProjectOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
          <Title level={4} style={{ color: '#8c8c8c' }}>Select a Project</Title>
          <Text type="secondary">Choose a project from the dropdown above to view and log time entries.</Text>
        </Card>
      )}
    </div>
  );
};

export default Timesheets;
