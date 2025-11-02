import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form, Statistic } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TimeTracking = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [loading, setLoading] = useState(false);

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: text => moment(text).format('MM/DD/YYYY')
    },
    {
      title: 'Employee',
      dataIndex: 'employee',
      key: 'employee',
      sorter: (a, b) => a.employee.localeCompare(b.employee)
    },
    {
      title: 'Project',
      dataIndex: 'project',
      key: 'project',
      sorter: (a, b) => a.project.localeCompare(b.project)
    },
    {
      title: 'Task',
      dataIndex: 'task',
      key: 'task'
    },
    {
      title: 'Hours',
      dataIndex: 'hours',
      key: 'hours',
      align: 'right',
      render: value => value.toFixed(2),
      sorter: (a, b) => a.hours - b.hours
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      key: 'rate',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: (_, record) => (record.hours * record.rate).toLocaleString('en-US', { 
        style: 'currency', 
        currency: 'USD' 
      })
    }
  ];

  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    // initial load
    handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = (dates) => {
    setDateRange(dates);
  };

  const handleEmployeeChange = (value) => {
    setSelectedEmployee(value);
  };

  const handleProjectChange = (value) => {
    setSelectedProject(value);
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use management report as a best-effort source for time-related KPIs.
      // Backend provides get-management which returns KPI/table data.
      const report = await window.electronAPI.getManagementReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );

      // Map report.tableData (metric/value) to a time-tracking like table if present
      if (report && Array.isArray(report.tableData)) {
        const mapped = report.tableData.map((row, idx) => ({
          key: String(idx + 1),
          date: dateRange[0].format('YYYY-MM-DD'),
          employee: row.metric,
          project: '—',
          task: row.metric,
          hours: 0,
          rate: 0,
          total: row.value || 0,
        }));
        setData(mapped);
      } else {
        // fallback empty
        setData([]);
      }
    } catch (err) {
      console.error('Error loading time tracking data', err);
      setError(err.message || String(err));
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary statistics
  const totalHours = data.reduce((sum, entry) => sum + (entry.hours || 0), 0);
  const totalValue = data.reduce((sum, entry) => sum + ((entry.hours || 0) * (entry.rate || 0)), 0);
  const averageRate = totalHours > 0 ? totalValue / totalHours : 0;

  return (
    <Card title="Time Tracking Report">
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
          <Col span={6}>
            <Form.Item label="Employee">
              <Select
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                style={{ width: '100%' }}
              >
                <Option value="all">All Employees</Option>
                <Option value="john">John Doe</Option>
                <Option value="jane">Jane Smith</Option>
                <Option value="mike">Mike Johnson</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Project">
              <Select
                value={selectedProject}
                onChange={handleProjectChange}
                style={{ width: '100%' }}
              >
                <Option value="all">All Projects</Option>
                <Option value="office">Office Renovation</Option>
                <Option value="software">Software Implementation</Option>
                <Option value="marketing">Marketing Campaign</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label=" ">
              <Button type="primary" onClick={handleRefresh} loading={loading}>
                Refresh Report
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Statistic
            title="Total Hours"
            value={totalHours}
            precision={2}
            prefix={<ClockCircleOutlined />}
            suffix="hrs"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Average Hourly Rate"
            value={averageRate}
            precision={2}
            prefix="$"
            suffix="/hr"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Total Value"
            value={totalValue}
            precision={2}
            prefix="$"
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        scroll={{ x: true }}
        summary={pageData => {
          const totalHours = pageData.reduce((sum, entry) => sum + (entry.hours || 0), 0);
          const totalAmount = pageData.reduce((sum, entry) => sum + ((entry.hours || 0) * (entry.rate || 0)), 0);

          return (
            <Table.Summary.Row>
              <Table.Summary.Cell colSpan={4}>Total</Table.Summary.Cell>
              <Table.Summary.Cell align="right">
                {totalHours.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right">-</Table.Summary.Cell>
              <Table.Summary.Cell align="right">
                {totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
      {error && <div style={{ color: 'red', marginTop: 12 }}>Error: {error}</div>}
    </Card>
  );
};

export default TimeTracking;