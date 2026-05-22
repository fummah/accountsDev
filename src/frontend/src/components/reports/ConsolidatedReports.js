import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, DatePicker, message, Tag, Space, Row, Col, Statistic, Tabs, Divider } from 'antd';
import { ClusterOutlined, FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const ConsolidatedReports = () => {
  const [runs, setRuns] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [genVisible, setGenVisible] = useState(false);
  const [viewVisible, setViewVisible] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment()]);
  const [selectedEntities, setSelectedEntities] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([
        window.electronAPI.consolidationRuns?.() || [],
        window.electronAPI.listEntities?.() || [],
      ]);
      setRuns(Array.isArray(r) ? r : []);
      setEntities(Array.isArray(e) ? e : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.consolidationGenerate?.(
        dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD'), selectedEntities
      );
      if (result?.error) { message.error(result.error); return; }
      message.success('Consolidated report generated');
      setGenVisible(false);
      loadData();
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const viewRun = async (id) => {
    const run = await window.electronAPI.consolidationRunGet?.(id);
    if (run) { setViewData(run.data || run); setViewVisible(true); }
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const acctColumns = [
    { title: 'Account', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => <Tag>{v}</Tag> },
    { title: 'Debit', dataIndex: 'totalDebit', key: 'totalDebit', align: 'right', render: v => fmt(v) },
    { title: 'Credit', dataIndex: 'totalCredit', key: 'totalCredit', align: 'right', render: v => fmt(v) },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', align: 'right', render: v => fmt(v) },
  ];

  const runColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Period', key: 'period', render: (_, r) => `${r.start_date} to ${r.end_date}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'Completed' ? 'green' : 'orange'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '' },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => viewRun(r.id)}>View</Button>
          <Button size="small" danger onClick={async () => { await window.electronAPI.consolidationRunDelete?.(r.id); loadData(); }}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><ClusterOutlined /> Consolidated Multi-Company Reports</>}
      extra={<Button type="primary" onClick={() => setGenVisible(true)}>Generate Report</Button>}>
      <Table columns={runColumns} dataSource={runs} rowKey="id" loading={loading} size="small" />

      <Modal title="Generate Consolidated Report" visible={genVisible} onOk={handleGenerate} onCancel={() => setGenVisible(false)} confirmLoading={loading}>
        <Form layout="vertical">
          <Form.Item label="Report Period">
            <RangePicker value={dateRange} onChange={v => setDateRange(v)} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Entities (leave empty for all)">
            <Select mode="multiple" allowClear placeholder="Select entities" value={selectedEntities} onChange={v => setSelectedEntities(v)}>
              {entities.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Consolidated Financial Statements" visible={viewVisible} onCancel={() => setViewVisible(false)} footer={null} width={900}>
        {viewData && (
          <Tabs defaultActiveKey="1">
            <TabPane tab="Profit & Loss" key="1">
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Statistic title="Total Revenue" value={viewData.profitAndLoss?.totalRevenue} prefix="$" precision={2} /></Col>
                <Col span={8}><Statistic title="Total Expenses" value={viewData.profitAndLoss?.totalExpenses} prefix="$" precision={2} /></Col>
                <Col span={8}><Statistic title="Net Income" value={viewData.profitAndLoss?.netIncome} prefix="$" precision={2} valueStyle={{ color: (viewData.profitAndLoss?.netIncome || 0) >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
              </Row>
              <Divider>Revenue</Divider>
              <Table columns={acctColumns} dataSource={viewData.profitAndLoss?.revenue || []} rowKey="name" size="small" pagination={false} />
              <Divider>Expenses</Divider>
              <Table columns={acctColumns} dataSource={viewData.profitAndLoss?.expenses || []} rowKey="name" size="small" pagination={false} />
            </TabPane>
            <TabPane tab="Balance Sheet" key="2">
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Statistic title="Total Assets" value={viewData.balanceSheet?.totalAssets} prefix="$" precision={2} /></Col>
                <Col span={8}><Statistic title="Total Liabilities" value={viewData.balanceSheet?.totalLiabilities} prefix="$" precision={2} /></Col>
                <Col span={8}><Statistic title="Total Equity" value={viewData.balanceSheet?.totalEquity} prefix="$" precision={2} /></Col>
              </Row>
              <Divider>Assets</Divider>
              <Table columns={acctColumns} dataSource={viewData.balanceSheet?.assets || []} rowKey="name" size="small" pagination={false} />
              <Divider>Liabilities</Divider>
              <Table columns={acctColumns} dataSource={viewData.balanceSheet?.liabilities || []} rowKey="name" size="small" pagination={false} />
              <Divider>Equity</Divider>
              <Table columns={acctColumns} dataSource={viewData.balanceSheet?.equity || []} rowKey="name" size="small" pagination={false} />
            </TabPane>
            <TabPane tab="All Accounts" key="3">
              <Table columns={acctColumns} dataSource={viewData.allAccounts || []} rowKey="name" size="small" pagination={{ pageSize: 25 }} />
            </TabPane>
          </Tabs>
        )}
      </Modal>
    </Card>
  );
};

export default ConsolidatedReports;
