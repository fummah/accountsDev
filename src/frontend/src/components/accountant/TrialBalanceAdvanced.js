import React, { useEffect, useState, useMemo } from 'react';
import { Card, Form, Select, DatePicker, Button, Table, message, Row, Col, Space, Input, Tag, Typography, Statistic, Alert, Tooltip } from 'antd';
import { PrinterOutlined, DownloadOutlined, SyncOutlined, SearchOutlined, FilterOutlined, CheckCircleOutlined, WarningOutlined, ApartmentOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Title, Text } = Typography;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TrialBalanceAdvanced = () => {
  const { symbol: cSym } = useCurrency();
  const [entities, setEntities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [lastFilters, setLastFilters] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [ents, cls, locs, deps] = await Promise.all([
          window.electronAPI.listEntities?.(),
          window.electronAPI.listClasses?.(),
          window.electronAPI.listLocations?.(),
          window.electronAPI.listDepartments?.(),
        ]);
        setEntities(Array.isArray(ents) ? ents : []);
        setClasses(Array.isArray(cls) ? cls : []);
        setLocations(Array.isArray(locs) ? locs : []);
        setDepartments(Array.isArray(deps) ? deps : []);
      } catch {
        message.error('Failed to load dimension filters');
      }
    })();
  }, []);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const [start, end] = values.range || [];
      const filters = {
        entityIds: values.entityIds || [],
        classTag: values.class || undefined,
        location: values.location || undefined,
        department: values.department || undefined,
        startDate: start ? start.format('YYYY-MM-DD') : undefined,
        endDate: end ? end.format('YYYY-MM-DD') : undefined,
      };
      setLastFilters(filters);
      const data = await window.electronAPI.getTrialBalanceAdvanced(filters);
      if (!Array.isArray(data)) {
        message.error(data?.error || 'Failed to load trial balance');
        setRows([]);
        return;
      }
      setRows(data.map((r, i) => ({
        key: i,
        accountCode: r.accountCode || r.accountNumber || '',
        accountName: r.accountName || '',
        accountType: r.accountType || r.type || '',
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        balance: Number(r.balance || 0),
      })));
    } catch {
      message.error('Failed to run advanced trial balance');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchText) return rows;
    return rows.filter(r =>
      (r.accountName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (r.accountCode || '').toLowerCase().includes(searchText.toLowerCase())
    );
  }, [rows, searchText]);

  const totalDebit = useMemo(() => filtered.reduce((s, r) => s + r.debit, 0), [filtered]);
  const totalCredit = useMemo(() => filtered.reduce((s, r) => s + r.credit, 0), [filtered]);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  const handleExport = () => {
    if (!filtered.length) { message.warning('No data to export'); return; }
    const lines = [['Account Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Balance'].join(',')];
    filtered.forEach(r => {
      lines.push([`"${r.accountCode}"`, `"${r.accountName}"`, `"${r.accountType}"`, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)].join(','));
    });
    lines.push(['', 'TOTALS', '', totalDebit.toFixed(2), totalCredit.toFixed(2), ''].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `advanced-trial-balance-${moment().format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!filtered.length) { message.warning('No data to print'); return; }
    const rowsHtml = filtered.map(r => `<tr><td>${r.accountCode}</td><td>${r.accountName}</td><td>${r.accountType}</td><td style="text-align:right">${fmt(r.debit)}</td><td style="text-align:right">${fmt(r.credit)}</td><td style="text-align:right">${fmt(r.balance)}</td></tr>`).join('');
    const filterDesc = lastFilters ? [
      lastFilters.startDate ? `Period: ${lastFilters.startDate} to ${lastFilters.endDate}` : '',
      lastFilters.entityIds?.length ? `Entities: ${lastFilters.entityIds.join(', ')}` : '',
      lastFilters.classTag ? `Class: ${lastFilters.classTag}` : '',
      lastFilters.location ? `Location: ${lastFilters.location}` : '',
      lastFilters.department ? `Department: ${lastFilters.department}` : '',
    ].filter(Boolean).join(' | ') : '';
    const html = `<!doctype html><html><head><title>Advanced Trial Balance</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:left}tfoot td{font-weight:bold;border-top:2px solid #333}</style></head><body><h2>Advanced Trial Balance</h2><p>${filterDesc}</p><table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Totals (${filtered.length} accounts)</td><td style="text-align:right">${fmt(totalDebit)}</td><td style="text-align:right">${fmt(totalCredit)}</td><td style="text-align:right">${fmt(totalDebit - totalCredit)}</td></tr></tfoot></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const columns = [
    { title: 'Code', dataIndex: 'accountCode', key: 'accountCode', width: 100, sorter: (a, b) => (a.accountCode || '').localeCompare(b.accountCode || '') },
    { title: 'Account Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => (a.accountName || '').localeCompare(b.accountName || '') },
    { title: 'Type', dataIndex: 'accountType', key: 'accountType', width: 120, render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 140, align: 'right', sorter: (a, b) => a.debit - b.debit, render: v => v > 0 ? <Text style={{ color: '#3f8600' }}>{fmt(v)}</Text> : <Text type="secondary">-</Text> },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 140, align: 'right', sorter: (a, b) => a.credit - b.credit, render: v => v > 0 ? <Text style={{ color: '#cf1322' }}>{fmt(v)}</Text> : <Text type="secondary">-</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 140, align: 'right', sorter: (a, b) => a.balance - b.balance, render: v => <Text strong style={{ color: v >= 0 ? '#1890ff' : '#ff4d4f' }}>{fmt(v)}</Text> },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ApartmentOutlined style={{ marginRight: 8 }} />Advanced Trial Balance</Title>
          <Text type="secondary">Multi-entity &amp; dimensional trial balance with advanced filters</Text>
        </div>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={!filtered.length}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!filtered.length}>Export</Button>
        </Space>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }} title={<><FilterOutlined style={{ marginRight: 4 }} /> Dimension Filters</>}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="entityIds" label="Entities" style={{ marginBottom: 8 }}>
                <Select mode="multiple" style={{ width: '100%' }} placeholder="All entities" allowClear>
                  {entities.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="class" label="Class" style={{ marginBottom: 8 }}>
                <Select allowClear style={{ width: '100%' }} placeholder="All">
                  {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="location" label="Location" style={{ marginBottom: 8 }}>
                <Select allowClear style={{ width: '100%' }} placeholder="All">
                  {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="department" label="Department" style={{ marginBottom: 8 }}>
                <Select allowClear style={{ width: '100%' }} placeholder="All">
                  {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="range" label="Date Range" style={{ marginBottom: 8 }}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={loading} icon={<SyncOutlined />}>Generate Report</Button>
        </Form>
      </Card>

      {/* KPI + Balance Alert */}
      {rows.length > 0 && (
        <>
          <Alert
            message={isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance is NOT Balanced'}
            description={`Debits: ${fmt(totalDebit)} | Credits: ${fmt(totalCredit)} | Difference: ${fmt(difference)}`}
            type={isBalanced ? 'success' : 'error'}
            showIcon
            icon={isBalanced ? <CheckCircleOutlined /> : <WarningOutlined />}
            style={{ marginBottom: 16 }}
          />

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
                <Statistic title="Total Debits" value={totalDebit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#3f8600' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
                <Statistic title="Total Credits" value={totalCredit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderTop: isBalanced ? '3px solid #52c41a' : '3px solid #ff4d4f' }}>
                <Statistic title="Difference" value={difference} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: isBalanced ? '#52c41a' : '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
                <Statistic title="Accounts" value={filtered.length} valueStyle={{ fontSize: 18, color: '#1890ff' }} suffix={`/ ${rows.length}`} />
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Search */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Input placeholder="Search accounts..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear style={{ width: 300 }} />
        </div>
      )}

      {/* Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filtered}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} accounts` }}
          scroll={{ x: 800 }}
          locale={{ emptyText: 'Configure filters above and click "Generate Report"' }}
          summary={pageData => {
            if (!pageData.length) return null;
            return (
              <>
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={3}><Text strong>Totals ({filtered.length} accounts)</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(totalDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(totalCredit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(totalDebit - totalCredit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row style={{ background: isBalanced ? '#f6ffed' : '#fff2f0' }}>
                  <Table.Summary.Cell colSpan={3}>
                    <Text strong style={{ color: isBalanced ? '#52c41a' : '#ff4d4f' }}>
                      {isBalanced ? <CheckCircleOutlined style={{ marginRight: 4 }} /> : <WarningOutlined style={{ marginRight: 4 }} />}
                      Difference
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell colSpan={3} align="right">
                    <Text strong style={{ color: isBalanced ? '#52c41a' : '#ff4d4f' }}>{fmt(difference)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            );
          }}
        />
      </Card>
    </div>
  );
};

export default TrialBalanceAdvanced;
