import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, message, Input, Select, Modal } from 'antd';
import { UserOutlined, DollarOutlined, TeamOutlined, SearchOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import AddEmployee from '../Inner/Employees/AddEmployee';

const { Search } = Input;
const { Option } = Select;

const EmployeeCenter = () => {
  const history = useHistory();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const addEmployeeRef = useRef();
  const [detailsEmployee, setDetailsEmployee] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
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
      console.log('Frontend: Checking electronAPI availability...');
      if (!window.electronAPI) {
        throw new Error('electronAPI not available');
      }
      if (!window.electronAPI.getAllEmployees) {
        throw new Error('getAllEmployees method not found');
      }

      console.log('Frontend: Fetching employees...');
      const response = await window.electronAPI.getAllEmployees();
      console.log('Frontend: Received response:', response);
      
      if (!response) {
        throw new Error('No response received from server');
      }

      if (!response.success) {
        throw new Error(response.error || 'Server returned error status');
      }

      if (!response.data) {
        throw new Error('No data field in successful response');
      }

      const data = Array.isArray(response.data) ? response.data : [];
      console.log('Frontend: Setting employees data:', data);
      setEmployees(data);

      // Calculate statistics
      const active = data.filter(emp => emp.status === 'Active');
      console.log('Frontend: Active employees:', active.length);
      const totalSalary = active.reduce((sum, emp) => sum + (parseFloat(emp.salary) || 0), 0);

      setStats({
        totalEmployees: data.length,
        activeEmployees: active.length,
        totalPayroll: totalSalary,
        avgSalary: active.length ? totalSalary / active.length : 0
      });
    } catch (error) {
      console.error('Frontend Error Details:', {
        error: error,
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      message.error(`Failed to load employees: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSave = async (values) => {
    try {
      setLoading(true);
      
      // Convert date to string format if it exists
      const processedValues = {
        ...values,
        date_hired: values.date_hired ? values.date_hired.format('YYYY-MM-DD') : null,
        entered_by: 'current_user',  // This should be replaced with actual logged-in user
        salary: parseFloat(values.salary) || 0,
        status: values.status || 'Active',
        role: values.role || 'Staff',
        permissions: values.permissions || []
      };

      // Only keep relevant fields
      const allowedFields = [
        'first_name', 'last_name', 'mi', 'email', 'phone', 'address',
        'date_hired', 'entered_by', 'salary', 'status', 'role', 'permissions'
      ];
      
      const sanitizedData = {};
      allowedFields.forEach(field => {
        if (processedValues[field] !== undefined) {
          sanitizedData[field] = processedValues[field];
        }
      });

      let result;
      if (editingEmployee) {
        result = await window.electronAPI.updateEmployee({
          ...sanitizedData,
          id: editingEmployee.id
        });
      } else {
        result = await window.electronAPI.insertEmployee(sanitizedData);
      }

      if (result && result.success) {
        message.success(editingEmployee ? 'Employee updated successfully' : 'Employee added successfully');
        setShowAddDrawer(false);
        setEditingEmployee(null);
        loadEmployees();
      } else {
        message.error(result?.error || 'Failed to save employee');
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      message.error('Error saving employee: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setShowAddDrawer(true);
  };

  const handleViewDetails = (employee) => {
    // Open inline details modal instead of routing to a missing route
    setDetailsEmployee(employee);
    setDetailsVisible(true);
  };

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = (
      employee.first_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      employee.last_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchText.toLowerCase())
    );
    const matchesStatus = filterStatus === 'all' || employee.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      title: 'Employee ID',
      dataIndex: 'id',
      key: 'id',
      sorter: (a, b) => a.id - b.id
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => `${record.first_name} ${record.last_name}`,
      sorter: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Date Hired',
      dataIndex: 'date_hired',
      key: 'date_hired',
      render: (date) => date ? moment(date).format('MM/DD/YYYY') : '-',
      sorter: (a, b) => moment(a.date_hired).unix() - moment(b.date_hired).unix()
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      filters: [
        { text: 'Admin', value: 'Admin' },
        { text: 'Manager', value: 'Manager' },
        { text: 'Staff', value: 'Staff' }
      ],
      onFilter: (value, record) => record.role === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span style={{
          color: status === 'Active' ? '#52c41a' : 
                status === 'Inactive' ? '#f5222d' : '#faad14'
        }}>
          {status}
        </span>
      ),
    },
    {
      title: 'Permissions',
      key: 'permissions',
      render: (_, record) => {
        let permissions;
        try {
          permissions = record.permissions ? JSON.parse(record.permissions) : [];
        } catch (e) {
          permissions = [];
        }
        return permissions.join(', ');
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            onClick={() => handleViewDetails(record)}
          >
            Details
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
        title="Employee Management"
        extra={
          <Button 
            type="primary" 
            onClick={() => {
              setEditingEmployee(null);
              setShowAddDrawer(true);
            }}
          >
            Add Employee
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search employees..."
            allowClear
            onSearch={setSearchText}
            style={{ width: 200 }}
          />
          <Select
            style={{ width: 120 }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            <Option value="all">All Status</Option>
            <Option value="Active">Active</Option>
            <Option value="Inactive">Inactive</Option>
            <Option value="On Leave">On Leave</Option>
          </Select>
        </Space>

        <Table
          columns={columns}
          dataSource={filteredEmployees}
          rowKey="id"
          loading={loading}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} employees`
          }}
        />
      </Card>

      <AddEmployee
        open={showAddDrawer}
        employee={editingEmployee}
        onSaveUser={handleEmployeeSave}
        onUserClose={() => {
          setShowAddDrawer(false);
          setEditingEmployee(null);
        }}
        showDrawer={() => setShowAddDrawer(true)}
        setShowError={(show) => show && message.error('Please fill in all required fields')}
        setMessage={(msg) => message.warning(msg)}
        ref={addEmployeeRef}
      />
      {/* Details modal for viewing employee */}
      <Modal
        title="Employee Details"
        visible={detailsVisible}
        onCancel={() => { setDetailsVisible(false); setDetailsEmployee(null); }}
        footer={null}
      >
        {detailsEmployee ? (
          <div>
            <p><strong>Name:</strong> {detailsEmployee.first_name} {detailsEmployee.last_name}</p>
            <p><strong>Email:</strong> {detailsEmployee.email}</p>
            <p><strong>Phone:</strong> {detailsEmployee.phone}</p>
            <p><strong>Address:</strong> {detailsEmployee.address}</p>
            <p><strong>Hire Date:</strong> {detailsEmployee.date_hired ? moment(detailsEmployee.date_hired).format('MM/DD/YYYY') : 'N/A'}</p>
            <p><strong>Salary:</strong> {detailsEmployee.salary ? `$${Number(detailsEmployee.salary).toFixed(2)}` : 'N/A'}</p>
            <p><strong>Role:</strong> {detailsEmployee.role}</p>
            <p><strong>Status:</strong> {detailsEmployee.status}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default EmployeeCenter;