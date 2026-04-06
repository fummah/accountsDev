import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form, message, Statistic, Space, Tabs, Tag, Progress } from 'antd';
import { PrinterOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

const JobCosting = () => {
  const { symbol: cSym } = useCurrency();
  const fmtR = v => `${cSym} ${Number(v || 0).toFixed(2)}`;
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedJob, setSelectedJob] = useState('all');
  const [data, setData] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobOptions, setJobOptions] = useState([]);
  const [activeTab, setActiveTab] = useState('1');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load projects
      try {
        const projList = await window.electronAPI.getProjects?.();
        setProjects(Array.isArray(projList) ? projList : []);
      } catch (_) { setProjects([]); }

      // Load expenses
      const expenses = await window.electronAPI.getAllExpenses();
      const expList = Array.isArray(expenses) ? expenses : (expenses && expenses.all) ? expenses.all : expenses?.data || [];
      const expRows = expList
        .filter(e => {
          const d = e.payment_date ? moment(e.payment_date) : null;
          return d && d.isBetween(dateRange[0].startOf('day'), dateRange[1].endOf('day'), null, '[]');
        })
        .map((e, idx) => ({
          key: `e-${idx}`,
          date: e.payment_date,
          jobName: e.payee_name || String(e.payee || ''),
          type: e.category || 'Expense',
          description: e.ref_no || e.description || '',
          laborCost: 0,
          materialCost: Number(e.amount || 0),
          totalCost: Number(e.amount || 0),
          status: e.approval_status || 'Pending',
        }));

      // Add project-linked expenses from profitability data
      const projRows = [];
      for (const p of (Array.isArray(projects) ? projects : [])) {
        try {
          const prof = await window.electronAPI.getProjectProfitability?.(p.id);
          if (prof) {
            projRows.push({
              key: `p-${p.id}`,
              date: p.created_at || dateRange[0].format('YYYY-MM-DD'),
              jobName: p.name,
              type: 'Project',
              description: `Code: ${p.code || '-'} | Budget: R ${Number(p.budget || 0).toFixed(2)}`,
              laborCost: Number(prof.labourCost || 0),
              materialCost: Number(prof.materialCost || 0),
              totalCost: Number(prof.totalExpense || 0),
              revenue: Number(prof.totalRevenue || 0),
              status: p.status || 'active',
            });
          }
        } catch (_) {}
      }

      const rows = [...projRows, ...expRows];
      setData(rows);

      const jobs = Array.from(new Set(rows.map(r => r.jobName).filter(Boolean))).sort();
      setJobOptions(jobs);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchReport(); }, []);

  const filteredData = useMemo(() => {
    if (!selectedJob || selectedJob === 'all') return data;
    return data.filter(r => (r.jobName || '').toString() === selectedJob);
  }, [data, selectedJob]);

  const totals = useMemo(() => {
    let labor = 0, material = 0, total = 0, revenue = 0;
    filteredData.forEach(r => {
      labor += Number(r.laborCost || 0);
      material += Number(r.materialCost || 0);
      total += Number(r.totalCost || 0);
      revenue += Number(r.revenue || 0);
    });
    return { labor, material, total, revenue, profit: revenue - total };
  }, [filteredData]);

  const jobSummary = useMemo(() => {
    const map = {};
    data.forEach(r => {
      const name = r.jobName || 'Unassigned';
      if (!map[name]) map[name] = { jobName: name, labor: 0, material: 0, total: 0, revenue: 0, count: 0 };
      map[name].labor += Number(r.laborCost || 0);
      map[name].material += Number(r.materialCost || 0);
      map[name].total += Number(r.totalCost || 0);
      map[name].revenue += Number(r.revenue || 0);
      map[name].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [data]);

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', sorter: (a, b) => (a.date || '').localeCompare(b.date || ''),
      render: text => text ? moment(text).format('DD/MM/YYYY') : '-' },
    { title: 'Job / Project', dataIndex: 'jobName', key: 'jobName', sorter: (a, b) => (a.jobName || '').localeCompare(b.jobName || ''),
      render: v => <strong>{v || '-'}</strong> },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => <Tag color={v === 'Project' ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Labor Cost', dataIndex: 'laborCost', key: 'laborCost', align: 'right', sorter: (a, b) => Number(a.laborCost || 0) - Number(b.laborCost || 0), render: fmtR },
    { title: 'Material Cost', dataIndex: 'materialCost', key: 'materialCost', align: 'right', sorter: (a, b) => Number(a.materialCost || 0) - Number(b.materialCost || 0), render: fmtR },
    { title: 'Total Cost', dataIndex: 'totalCost', key: 'totalCost', align: 'right', sorter: (a, b) => Number(a.totalCost || 0) - Number(b.totalCost || 0), render: v => <strong>{fmtR(v)}</strong> },
  ];

  const summaryColumns = [
    { title: 'Job / Project', dataIndex: 'jobName', key: 'jobName', render: v => <strong>{v}</strong> },
    { title: 'Entries', dataIndex: 'count', key: 'count', width: 80 },
    { title: 'Labor', dataIndex: 'labor', key: 'labor', align: 'right', render: fmtR },
    { title: 'Material', dataIndex: 'material', key: 'material', align: 'right', render: fmtR },
    { title: 'Total Cost', dataIndex: 'total', key: 'total', align: 'right', render: v => <strong>{fmtR(v)}</strong>, sorter: (a, b) => a.total - b.total },
    { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', align: 'right', render: v => v > 0 ? <span style={{ color: '#3f8600' }}>{fmtR(v)}</span> : '-' },
    { title: 'Profit/Loss', key: 'pl', align: 'right', render: (_, r) => { const p = r.revenue - r.total; return p !== 0 ? <span style={{ color: p >= 0 ? '#3f8600' : '#cf1322', fontWeight: 600 }}>{fmtR(p)}</span> : '-'; }},
  ];

  const handlePrint = () => {
    try {
      const rows = filteredData.map(r => `<tr>
        <td>${r.date ? moment(r.date).format('DD/MM/YYYY') : ''}</td>
        <td>${r.jobName || ''}</td><td>${r.type || ''}</td><td>${r.description || ''}</td>
        <td style="text-align:right">${fmtR(r.laborCost)}</td>
        <td style="text-align:right">${fmtR(r.materialCost)}</td>
        <td style="text-align:right">${fmtR(r.totalCost)}</td></tr>`).join('');
      const html = `<!doctype html><html><head><title>Job Costing Report</title>
      <style>body{font-family:Arial;padding:16px}h2{margin:0 0 8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}th{text-align:left;background:#f5f5f5}</style></head><body>
      <h2>Job Costing Report</h2>
      <p>Period: ${dateRange[0].format('DD/MM/YYYY')} to ${dateRange[1].format('DD/MM/YYYY')} | Job: ${selectedJob}</p>
      <table><thead><tr><th>Date</th><th>Job/Project</th><th>Type</th><th>Description</th><th>Labor</th><th>Material</th><th>Total</th></tr></thead><tbody>${rows}
      <tr style="font-weight:bold;background:#fafafa"><td colspan="4">TOTALS</td><td style="text-align:right">${fmtR(totals.labor)}</td><td style="text-align:right">${fmtR(totals.material)}</td><td style="text-align:right">${fmtR(totals.total)}</td></tr>
      </tbody></table></body></html>`;
      const w = window.open('', '_blank');
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    } catch (_) {}
  };

  const exportCSV = () => {
    try {
      const headers = ['date', 'jobName', 'type', 'description', 'laborCost', 'materialCost', 'totalCost'];
      const rows = filteredData.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `job_costing_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Job Costing Report</span>}
        extra={<Space><Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button><Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={5}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Cost" value={totals.total} prefix={cSym} precision={2} /></Card></Col>
          <Col span={5}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Labor Cost" value={totals.labor} prefix={cSym} precision={2} valueStyle={{ color: '#1890ff' }} /></Card></Col>
          <Col span={5}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Material Cost" value={totals.material} prefix={cSym} precision={2} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
          <Col span={5}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Revenue" value={totals.revenue} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={4}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Profit/Loss" value={totals.profit} prefix={cSym} precision={2} valueStyle={{ color: totals.profit >= 0 ? '#3f8600' : '#cf1322' }} /></Card></Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <RangePicker value={dateRange} onChange={d => setDateRange(d || [moment().startOf('month'), moment()])} format="DD/MM/YYYY" />
          <Select value={selectedJob} onChange={v => setSelectedJob(v)} style={{ width: 220 }} showSearch optionFilterProp="children">
            <Option value="all">All Jobs / Projects</Option>
            {jobOptions.map(j => <Option key={j} value={j}>{j}</Option>)}
          </Select>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchReport} loading={loading}>Refresh</Button>
        </Space>

        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}

        <div style={{ marginBottom: 16, borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
          <Button
            type={activeTab === '1' ? 'primary' : 'default'}
            onClick={() => setActiveTab('1')}
            style={{ marginRight: 8 }}
          >{`Detail (${filteredData.length})`}</Button>
          <Button
            type={activeTab === '2' ? 'primary' : 'default'}
            onClick={() => setActiveTab('2')}
          >{`Summary by Job (${jobSummary.length})`}</Button>
        </div>

        {activeTab === '1' && (
          <Table columns={columns} dataSource={filteredData} loading={loading} rowKey="key"
            pagination={{ pageSize: 25, showSizeChanger: true, showTotal: t => `${t} entries` }} size="middle"
            summary={pageData => {
              let tl = 0, tm = 0, tt = 0;
              pageData.forEach(r => { tl += Number(r.laborCost || 0); tm += Number(r.materialCost || 0); tt += Number(r.totalCost || 0); });
              return (
                <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4}>Page Total</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{fmtR(tl)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{fmtR(tm)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{fmtR(tt)}</Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }} />
        )}

        {activeTab === '2' && (
          <Table columns={summaryColumns} dataSource={jobSummary} rowKey="jobName" size="middle" pagination={false} />
        )}
      </Card>
    </div>
  );
};

export default JobCosting;