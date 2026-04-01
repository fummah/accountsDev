import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Select, Input, Tag, Row, Col, Statistic, DatePicker, Space, message, Modal } from 'antd';
import { AuditOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons';

const AuditTrail = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ action: '', entityType: '', userId: '', limit: 500 });
  const [chainResult, setChainResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const clean = {};
      if (filters.action) clean.action = filters.action;
      if (filters.entityType) clean.entityType = filters.entityType;
      if (filters.userId) clean.userId = filters.userId;
      clean.limit = filters.limit || 500;
      const res = await window.electronAPI.auditSearch?.(clean);
      if (Array.isArray(res)) setLogs(res);
      const s = await window.electronAPI.auditStats?.();
      if (s && !s.error) setStats(s);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const verifyChain = async () => {
    try {
      const res = await window.electronAPI.auditVerifyChain?.(500);
      setChainResult(res);
      if (res?.broken === 0) {
        message.success(`Chain integrity verified: ${res.total} entries, no breaks`);
      } else {
        message.warning(`Chain has ${res.broken} break(s) in ${res.total} entries`);
      }
    } catch (e) {
      message.error(e?.message || 'Verification failed');
    }
  };

  const actionColors = {
    create: 'green', update: 'blue', delete: 'red', void: 'volcano',
    login: 'cyan', logout: 'default', scheduledBackup: 'purple',
    databaseImported: 'orange', syncConflict: 'magenta',
  };

  const columns = [
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', width: 160,
      sorter: (a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''),
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'User', dataIndex: 'userId', key: 'userId', width: 100,
      render: v => v || <Tag>system</Tag> },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 100,
      render: v => <Tag color={actionColors[v] || 'default'}>{v}</Tag> },
    { title: 'Entity Type', dataIndex: 'entityType', key: 'entityType', width: 120 },
    { title: 'Entity ID', dataIndex: 'entityId', key: 'entityId', width: 90 },
    { title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true,
      render: v => {
        if (!v) return '-';
        try {
          const obj = typeof v === 'string' ? JSON.parse(v) : v;
          const keys = Object.keys(obj).slice(0, 3);
          return keys.map(k => `${k}: ${JSON.stringify(obj[k]).substring(0, 40)}`).join(', ');
        } catch { return String(v).substring(0, 80); }
      }
    },
    { title: 'Hash', dataIndex: 'entry_hash', key: 'hash', width: 90,
      render: v => v ? <Tag style={{ fontSize: 10 }}>{v.substring(0, 8)}...</Tag> : '-' },
  ];

  const uniqueActions = stats?.actions?.map(a => a.action) || [];
  const uniqueEntities = stats?.entities?.map(e => e.entityType) || [];

  return (
    <div style={{ padding: 24 }}>
      <h2><AuditOutlined /> Audit Trail</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Tamper-evident audit log with SHA-256 hash chain. Every create, update, delete, login, backup, and sync event is recorded.
      </p>

      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="Total Entries" value={stats.total} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Action Types" value={stats.actions?.length || 0} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Entity Types" value={stats.entities?.length || 0} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Users Tracked" value={stats.users?.length || 0} /></Card>
          </Col>
        </Row>
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select placeholder="Action" allowClear style={{ width: 140 }}
            value={filters.action || undefined}
            onChange={v => setFilters(f => ({ ...f, action: v || '' }))}>
            {uniqueActions.map(a => <Select.Option key={a} value={a}>{a}</Select.Option>)}
          </Select>
          <Select placeholder="Entity Type" allowClear style={{ width: 160 }}
            value={filters.entityType || undefined}
            onChange={v => setFilters(f => ({ ...f, entityType: v || '' }))}>
            {uniqueEntities.map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
          </Select>
          <Input placeholder="User ID" style={{ width: 120 }}
            value={filters.userId}
            onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))} />
          <Button type="primary" icon={<SearchOutlined />} onClick={load} loading={loading}>Search</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ action: '', entityType: '', userId: '', limit: 500 }); load(); }}>Reset</Button>
          <div style={{ marginLeft: 'auto' }}>
            <Button icon={<SafetyCertificateOutlined />} onClick={verifyChain}
              style={{ borderColor: '#52c41a', color: '#52c41a' }}>
              Verify Chain Integrity
            </Button>
          </div>
        </div>
      </Card>

      {chainResult && (
        <Card size="small" style={{ marginBottom: 16, borderColor: chainResult.broken === 0 ? '#52c41a' : '#f5222d' }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="Total Entries" value={chainResult.total} />
            </Col>
            <Col span={6}>
              <Statistic title="Hash-Chained" value={chainResult.verified ?? chainResult.total}
                valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Chain Breaks" value={chainResult.broken}
                valueStyle={{ color: chainResult.broken === 0 ? '#52c41a' : '#f5222d' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Integrity" value={chainResult.broken === 0 ? 'PASS' : 'FAIL'}
                valueStyle={{ color: chainResult.broken === 0 ? '#52c41a' : '#f5222d', fontWeight: 700 }} />
            </Col>
          </Row>
          {chainResult.legacy > 0 && (
            <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 12 }}>
              {chainResult.legacy} legacy entries (created before hash chain) are excluded from verification.
            </p>
          )}
        </Card>
      )}

      <Card title={`Audit Entries (${logs.length})`} size="small">
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'] }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
};

export default AuditTrail;
