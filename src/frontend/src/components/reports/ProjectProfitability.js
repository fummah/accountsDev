import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form, Statistic } from 'antd';
import { DollarOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ProjectProfitability = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
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
        const margin = (record.revenue - record.costs) / record.revenue * 100;
        const color = margin >= 0 ? '#3f8600' : '#cf1322';
        return (
          <span style={{ color }}>
            {margin.toFixed(2)}%
          </span>
        );
      },
      sorter: (a, b) => {
        const marginA = (a.revenue - a.costs) / a.revenue;
        const marginB = (b.revenue - b.costs) / b.revenue;
        return marginA - marginB;
      }
    }
  ];

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      // Best-effort: use management report or financial report to derive project-level overview
      const report = await window.electronAPI.getManagementReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );
      if (report && Array.isArray(report.chartData)) {
        // Map chartData (name/value) into projects
        const rows = report.chartData.map((r, i) => ({
          key: String(i + 1),
          projectName: r.name,
          startDate: dateRange[0].format('YYYY-MM-DD'),
          revenue: Number(r.value || 0),
          costs: 0,
        }));
        setData(rows);
      } else if (report && Array.isArray(report.tableData)) {
        // Fallback use tableData
        const rows = report.tableData.map((r, i) => {
          const raw = typeof r.value === 'string' ? Number(String(r.value).replace(/[^0-9.-]+/g, '')) : Number(r.value || 0);
          return {
            key: String(i + 1),
            projectName: r.metric,
            startDate: dateRange[0].format('YYYY-MM-DD'),
            revenue: raw,
            costs: 0,
          };
        });
        setData(rows);
      } else {
        setData([]);
      }
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
                <Option value="active">Active Projects</Option>
                <Option value="completed">Completed Projects</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" ">
              <Button type="primary" onClick={handleRefresh} loading={loading}>
                Refresh Report
              </Button>
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
        dataSource={data}
        loading={loading}
        pagination={false}
        scroll={{ x: true }}
      />
      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </Card>
  );
};

export default ProjectProfitability;