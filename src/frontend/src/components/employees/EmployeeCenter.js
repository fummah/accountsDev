import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, message } from 'antd';
import { UserOutlined, DollarOutlined, CalendarOutlined, TeamOutlined } from '@ant-design/icons';
import moment from 'moment';

const EmployeeCenter = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    totalPayroll: 0,
    avgSalary: 0
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getEmployees();
      setEmployees(data);

      // Calculate statistics
      const active = data.filter(emp => emp.status === 'Active');
      const totalSalary = active.reduce((sum, emp) => sum + (emp.salary || 0), 0);

      setStats({
        totalEmployees: data.length,
        activeEmployees: active.length,
        totalPayroll: totalSalary,
        avgSalary: active.length ? totalSalary / active.length : 0
      });
    } catch (error) {
      message.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'employeeId',
      key: 'employeeId',
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => `${record.first_name} ${record.last_name}`,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: 'Date Hired',
      dataIndex: 'date_hired',
      key: 'date_hired',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => window.location.href = `/main/employees/edit/${record.id}`}>
            Edit
          </Button>
          <Button type="link" onClick={() => window.location.href = `/main/employees/details/${record.id}`}>
            View Details
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Employee Center</h2>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Employees"
              value={stats.totalEmployees}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Employees"
              value={stats.activeEmployees}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Monthly Payroll"
              value={stats.totalPayroll}
              precision={2}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Average Salary"
              value={stats.avgSalary}
              precision={2}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Recent Employees"
        extra={
          <Button type="primary" onClick={() => window.location.href = '/main/employees/new'}>
            Add Employee
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={employees}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default EmployeeCenter;