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
      // Pull projects, invoices, and expenses
      const [projectsRes, invoicesRes, expensesRes] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getAllInvoices(),
        window.electronAPI.getAllExpenses()
      ]);
      const projects = Array.isArray(projectsRes) ? projectsRes : [];
      const invoices = Array.isArray(invoicesRes?.all) ? invoicesRes.all : (Array.isArray(invoicesRes) ? invoicesRes : []);
      const expenses = Array.isArray(expensesRes?.all) ? expensesRes.all : (Array.isArray(expensesRes) ? expensesRes : []);

      // Filter by date range
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      const invInRange = invoices.filter(inv => inv.start_date && moment(inv.start_date).isBetween(start, end, null, '[]'));
      const expInRange = expenses.filter(ex => ex.payment_date && moment(ex.payment_date).isBetween(start, end, null, '[]'));

      // Initialize revenue and cost by actual project ID
      const revenueByProject = {};
      const costByProject = {};
      
      // Initialize all projects with zero values
      projects.forEach(p => {
        revenueByProject[p.id] = 0;
        costByProject[p.id] = 0;
      });

      // Aggregate revenue by project reference
      invInRange.forEach(inv => {
        const projectId = inv.projectId || inv.project_id || null;
        const amount = Number(inv.amount || 0);
        const vat = Number(inv.vat || 0);
        const gross = amount + (amount * vat / 100);
        
        if (projectId && revenueByProject.hasOwnProperty(projectId)) {
          revenueByProject[projectId] += gross;
        } else {
          // Fallback: group by customer name for unassigned invoices
          const customerKey = `customer:${inv.customer_name || inv.customer || 'Unassigned'}`;
          revenueByProject[customerKey] = (revenueByProject[customerKey] || 0) + gross;
        }
      });

      // Aggregate cost by project reference
      expInRange.forEach(ex => {
        const projectId = ex.projectId || ex.project_id || null;
        const amt = Number(ex.amount || 0);
        
        if (projectId && costByProject.hasOwnProperty(projectId)) {
          costByProject[projectId] += amt;
        } else {
          // Fallback: group by payee name for unassigned expenses
          const payeeKey = `payee:${ex.payee_name || ex.payee || 'Unassigned'}`;
          costByProject[payeeKey] = (costByProject[payeeKey] || 0) + amt;
        }
      });

      // Build rows combining actual projects and fallback groupings
      const rows = [];
      const projectOptions = [{ id: 'all', name: 'All Projects' }];
      
      // Add actual projects
      projects.forEach(p => {
        rows.push({
          key: `project:${p.id}`,
          projectName: p.name || p.code || 'Unnamed Project',
          projectId: p.id,
          startDate: p.startDate || p.start_date || dateRange[0].format('YYYY-MM-DD'),
          revenue: Number(revenueByProject[p.id] || 0),
          costs: Number(costByProject[p.id] || 0),
        });
        projectOptions.push({ id: p.id, name: p.name || p.code || 'Unnamed Project' });
      });
      
      // Add fallback groupings (unassigned invoices/expenses)
      Object.keys(revenueByProject).forEach(key => {
        if (key.startsWith('customer:')) {
          const name = key.replace('customer:', '');
          if (!rows.find(r => r.projectName === name)) {
            rows.push({
              key: key,
              projectName: name,
              projectId: key,
              startDate: dateRange[0].format('YYYY-MM-DD'),
              revenue: Number(revenueByProject[key] || 0),
              costs: Number(costByProject[key] || 0),
            });
            projectOptions.push({ id: key, name: name });
          }
        }
      });
      
      Object.keys(costByProject).forEach(key => {
        if (key.startsWith('payee:') && !rows.find(r => r.key === key)) {
          const name = key.replace('payee:', '');
          rows.push({
            key: key,
            projectName: name,
            projectId: key,
            startDate: dateRange[0].format('YYYY-MM-DD'),
            revenue: Number(revenueByProject[key] || 0),
            costs: Number(costByProject[key] || 0),
          });
          projectOptions.push({ id: key, name: name });
        }
      });
      
      setData(rows);
      setProjects(projectOptions);
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
    return data.filter(r => (r.projectId || '').toString() === selectedProject);
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
                {projects.map(p => (<Option key={p.id} value={p.id}>{p.name}</Option>))}
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