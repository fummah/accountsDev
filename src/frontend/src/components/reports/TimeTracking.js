import React, { useState } from 'react';
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

  // Sample data - replace with actual data from your backend
  const data = [
    {
      key: '1',
      date: '2025-11-01',
      employee: 'John Doe',
      project: 'Office Renovation',
      task: 'Planning',
      hours: 8,
      rate: 75.00
    },
    {
      key: '2',
      date: '2025-11-01',
      employee: 'Jane Smith',
      project: 'Software Implementation',
      task: 'Development',
      hours: 6.5,
      rate: 85.00
    },
    {
      key: '3',
      date: '2025-11-01',
      employee: 'Mike Johnson',
      project: 'Marketing Campaign',
      task: 'Content Creation',
      hours: 4,
      rate: 65.00
    }
  ];

  const handleDateChange = (dates) => {
    setDateRange(dates);
  };

  const handleEmployeeChange = (value) => {
    setSelectedEmployee(value);
  };

  const handleProjectChange = (value) => {
    setSelectedProject(value);
  };

  const handleRefresh = () => {
    setLoading(true);
    // TODO: Implement data refresh logic
    setTimeout(() => setLoading(false), 1000);
  };

  // Calculate summary statistics
  const totalHours = data.reduce((sum, entry) => sum + entry.hours, 0);
  const totalValue = data.reduce((sum, entry) => sum + (entry.hours * entry.rate), 0);
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
          const totalHours = pageData.reduce((sum, entry) => sum + entry.hours, 0);
          const totalAmount = pageData.reduce((sum, entry) => sum + (entry.hours * entry.rate), 0);

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
    </Card>
  );
};

export default TimeTracking;