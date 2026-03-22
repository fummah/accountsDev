import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form, Statistic, message } from 'antd';
import { DollarOutlined, ArrowUpOutlined, ArrowDownOutlined, PrinterOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ProjectProfitability = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: 'Project Name',
      dataIndex: 'projectName',
      key: 'projectName',
      sorter: (a, b) => a.projectName.localeCompare(b.projectName)
    },
    {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      render: text => moment(text).format('MM/DD/YYYY')
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
      sorter: (a, b) => a.revenue - b.revenue
    },
    {
      title: 'Costs',
      dataIndex: 'costs',
      key: 'costs',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
      sorter: (a, b) => a.costs - b.costs
    },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      align: 'right',
      render: (_, record) => {
        const profit = record.revenue - record.costs;
        const color = profit >= 0 ? '#3f8600' : '#cf1322';
        return (
          <span style={{ color }}>
            {profit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        );
      },
      sorter: (a, b) => (a.revenue - a.costs) - (b.revenue - b.costs)
    },
    {
      title: 'Margin %',
      dataIndex: 'margin',
      key: 'margin',
      align: 'right',
      render: (_, record) => {
        const margin = record.revenue > 0 ? (record.revenue - record.costs) / record.revenue * 100 : 0;
        const color = margin >= 0 ? '#3f8600' : '#cf1322';
        return (
          <span style={{ color }}>
            {margin.toFixed(2)}%
          </span>
        );
      },
      sorter: (a, b) => {
        const marginA = a.revenue > 0 ? (a.revenue - a.costs) / a.revenue : 0;
        const marginB = b.revenue > 0 ? (b.revenue - b.costs) / b.revenue : 0;
        return marginA - marginB;
      }
    }
  ];

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull live invoices and expenses within range
      const [invoicesRes, expensesRes] = await Promise.all([
        window.electronAPI.getAllInvoices(),
        window.electronAPI.getAllExpenses()
      ]);
      const invoices = Array.isArray(invoicesRes?.all) ? invoicesRes.all : (Array.isArray(invoicesRes) ? invoicesRes : []);
      const expenses = Array.isArray(expensesRes?.all) ? expensesRes.all : (Array.isArray(expensesRes) ? expensesRes : []);

      // Filter by date range
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      const invInRange = invoices.filter(inv => inv.start_date && moment(inv.start_date).isBetween(start, end, null, '[]'));
      const expInRange = expenses.filter(ex => ex.payment_date && moment(ex.payment_date).isBetween(start, end, null, '[]'));

      // Aggregate revenue by customer (project)
      const revenueByProject = {};
      invInRange.forEach(inv => {
        const name = inv.customer_name || inv.customer || 'Unknown';
        const amount = Number(inv.amount || 0);
        const vat = Number(inv.vat || 0);
        const gross = amount + (amount * vat / 100);
        revenueByProject[name] = (revenueByProject[name] || 0) + gross;
      });

      // Aggregate cost by payee (also treat as project if it matches customer)
      const costByProject = {};
      expInRange.forEach(ex => {
        const name = ex.payee_name || ex.payee || 'Unknown';
        const amt = Number(ex.amount || 0);
        costByProject[name] = (costByProject[name] || 0) + amt;
      });

      // Merge into rows
      const projectNames = Array.from(new Set([...Object.keys(revenueByProject), ...Object.keys(costByProject)]));
      const rows = projectNames.map((p, i) => ({
        key: String(i + 1),
        projectName: p,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        revenue: Number(revenueByProject[p] || 0),
        costs: Number(costByProject[p] || 0),
      }));
      setData(rows);
      setProjects(projectNames);
    } catch (err) {
      console.error('Failed to load project profitability', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (dates) => {
    setDateRange(dates);
  };

  const handleProjectChange = (value) => {
    setSelectedProject(value);
  };

  const handleRefresh = () => {
    loadReport();
  };

  // Calculate summary statistics
  const totalRevenue = data.reduce((sum, project) => sum + (project.revenue || 0), 0);
  const totalCosts = data.reduce((sum, project) => sum + (project.costs || 0), 0);
  const totalProfit = totalRevenue - totalCosts;
  const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const filteredData = useMemo(() => {
    if (!selectedProject || selectedProject === 'all') return data;
    return data.filter(r => (r.projectName || '').toString() === selectedProject);
  }, [data, selectedProject]);

  const handlePrint = () => {
    try {
      const rows = filteredData.map(r => `<tr><td>${r.projectName}</td><td>${moment(dateRange[0]).format('YYYY-MM-DD')}</td><td style="text-align:right">${Number(r.revenue||0).toFixed(2)}</td><td style="text-align:right">${Number(r.costs||0).toFixed(2)}</td><td style="text-align:right">${Number((r.revenue||0)-(r.costs||0)).toFixed(2)}</td></tr>`).join('');
      const html = `<!doctype html><html><head><title>Project Profitability</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}</style></head><body><h2>Project Profitability</h2><p>Period: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')}</p><table><thead><tr><th>Project</th><th>Start</th><th>Revenue</th><th>Costs</th><th>Profit</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
    } catch (e) { /* noop */ }
  };

  return (
    <Card title="Project Profitability Report">
      <Form layout="vertical">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Date Range">
              <RangePicker
                value={dateRange}
                onChange={handleDateChange}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Project">
              <Select
                value={selectedProject}
                onChange={handleProjectChange}
                style={{ width: '100%' }}
              >
                <Option value="all">All Projects</Option>
                {projects.map(p => (<Option key={p} value={p}>{p}</Option>))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" ">
              <Button type="primary" onClick={handleRefresh} loading={loading}>
                Refresh Report
              </Button>
              <Button icon={<PrinterOutlined />} style={{ marginLeft: 8 }} onClick={handlePrint}>Print</Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Statistic
            title="Total Revenue"
            value={totalRevenue}
            precision={2}
            prefix={<DollarOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Costs"
            value={totalCosts}
            precision={2}
            prefix={<DollarOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Profit"
            value={totalProfit}
            precision={2}
            prefix={<DollarOutlined />}
            valueStyle={{ color: totalProfit >= 0 ? '#3f8600' : '#cf1322' }}
            suffix={totalProfit >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Average Margin"
            value={averageMargin}
            precision={2}
            suffix="%"
            valueStyle={{ color: averageMargin >= 0 ? '#3f8600' : '#cf1322' }}
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={filteredData}
        loading={loading}
        pagination={false}
        scroll={{ x: true }}
      />
      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </Card>
  );
};

export default ProjectProfitability;