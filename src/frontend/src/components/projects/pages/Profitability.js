import React, { useEffect, useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, Select, Row, Col, Statistic, Progress, Button, Space, message, Tag, Table } from 'antd';
import { DollarOutlined, FileTextOutlined, ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;

const Profitability = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [data, setData] = useState(null);
  const [unbilled, setUnbilled] = useState(0);
  const [timesheets, setTimesheets] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const list = await window.electronAPI.getProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch (_) { setProjects([]); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const load = useCallback(async () => {
    if (!projectId) { setData(null); return; }
    try {
      const d = await window.electronAPI.getProjectProfitability(Number(projectId));
      setData(d || null);
    } catch (_) { setData(null); }
    try {
      const ts = await window.electronAPI.listTimesheetsByProject(Number(projectId));
      const list = Array.isArray(ts) ? ts : [];
      setTimesheets(list);
      setUnbilled(list.filter(t => !t.billed).length);
    } catch (_) { setTimesheets([]); setUnbilled(0); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const profit = Number((data?.totalRevenue || 0) - (data?.totalExpense || 0));
  const margin = (data?.totalRevenue || 0) > 0 ? (profit / data.totalRevenue) * 100 : 0;
  const totalExpense = Number(data?.totalExpense || 0);

  const blocks = [
    { label: 'Revenue', value: Number(data?.totalRevenue || 0), color: '#52c41a' },
    { label: 'Labour', value: Number(data?.labourCost || 0), color: '#1890ff' },
    { label: 'Material', value: Number(data?.materialCost || 0), color: '#faad14' },
    { label: 'Overhead', value: Number(data?.overheadCost || 0), color: '#eb2f96' },
  ];
  const maxVal = Math.max(...blocks.map(b => b.value), 1);

  const createInvoice = async () => {
    try {
      setBusy(true);
      const res = await window.electronAPI.projectInvoiceFromTimesheets({ projectId: Number(projectId) });
      if (res && res.success) {
        message.success(`Created invoice #${res.invoiceId}`);
        await load();
      } else {
        message.error(res?.error || 'Failed to create invoice');
      }
    } catch (e) {
      message.error(e?.message || 'Failed');
    } finally { setBusy(false); }
  };

  const tsColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Employee', dataIndex: 'employeeName', key: 'employeeName', render: v => v || '-' },
    { title: 'Hours', dataIndex: 'hours', key: 'hours', render: v => Number(v || 0).toFixed(1) },
    { title: 'Rate', dataIndex: 'rate', key: 'rate', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
    { title: 'Total', key: 'total', render: (_, r) => `${cSym} ${(Number(r.hours || 0) * Number(r.rate || 0)).toFixed(2)}` },
    { title: 'Billed', dataIndex: 'billed', key: 'billed', render: v => v ? <Tag color="green">Yes</Tag> : <Tag color="orange">No</Tag> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Project Profitability Report</span>}
        extra={<Space><Button icon={<ArrowLeftOutlined />} onClick={() => { history.push('/main/projects/center'); }}>Projects Center</Button><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Space>}>

        <div style={{ marginBottom: 16 }}>
          <Select showSearch optionFilterProp="children" placeholder="Select a project to analyse"
            value={projectId} onChange={v => setProjectId(v)} style={{ width: 360 }} allowClear size="large">
            {projects.map(p => <Option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''}</Option>)}
          </Select>
        </div>

        {projectId && data && (
          <>
            <Row gutter={16} style={{ marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={6}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Total Revenue" value={Number(data.totalRevenue || 0)} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Total Expense" value={totalExpense} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Net Profit" value={profit} prefix={cSym} precision={2} valueStyle={{ color: profit >= 0 ? '#3f8600' : '#cf1322' }} />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Profit Margin" value={margin} precision={1} suffix="%" valueStyle={{ color: margin >= 0 ? '#3f8600' : '#cf1322' }} />
                </Card>
              </Col>
            </Row>

            <Card size="small" title="Cost Breakdown" style={{ marginBottom: 20 }}>
              {blocks.map(b => (
                <div key={b.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>{b.label}</span>
                    <strong>{cSym} {b.value.toFixed(2)}</strong>
                  </div>
                  <Progress percent={Math.round((b.value / maxVal) * 100)} strokeColor={b.color} showInfo={false} size="small" />
                </div>
              ))}
            </Card>

            <Card size="small" title={`Timesheets (${timesheets.length} entries, ${unbilled} unbilled)`}
              extra={
                <Button type="primary" icon={<FileTextOutlined />} disabled={!unbilled || busy} loading={busy} onClick={createInvoice}>
                  Invoice Unbilled ({unbilled})
                </Button>
              }>
              <Table columns={tsColumns} dataSource={timesheets} rowKey={(r, i) => r.id || i} size="small"
                pagination={{ pageSize: 10, showSizeChanger: true }} />
            </Card>
          </>
        )}

        {projectId && !data && (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>No profitability data available for this project</div>
        )}
      </Card>
    </div>
  );
};

export default Profitability;


