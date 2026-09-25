import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, DatePicker, message, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, MailOutlined, IdcardOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import {
  FormSection, FormGrid, FormCol, DocumentActionBar, FORM_ITEM_STYLE, MODAL_BODY_SCROLL_STYLE,
} from '../shared/FormSection';

const { Option } = Select;
const { Search } = Input;

const EmployeeList = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);

  const loadDepartments = async () => {
    try {
      const res = await window.electronAPI.listDepartments?.();
      setDepartments(Array.isArray(res) ? res : []);
    } catch { setDepartments([]); }
  };

  const loadRoles = async () => {
    try {
      const res = await window.electronAPI.listRoles?.();
      setRoles(Array.isArray(res) ? res : []);
    } catch { setRoles([]); }
  };

  useEffect(() => {
    loadEmployees();
    loadDepartments();
    loadRoles();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await window.electronAPI.getAllEmployees();
      console.log('Employee response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch employees');
      }

      const employeeData = response.data || [];
      if (!Array.isArray(employeeData)) {
        throw new Error('Invalid employee data format');
      }

      setEmployees(employeeData);
    } catch (error) {
      console.error('Error loading employees:', error);
      message.error(error.message || 'Failed to load employees');
      setEmployees([]); // Set empty array as fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const employeeData = {
        ...values,
        date_hired: values.date_hired.format('YYYY-MM-DD'),
        entered_by: 'current_user', // Replace with actual logged-in user
      };

      if (editingEmployee) {
        await window.electronAPI.updateEmployee({
          ...employeeData,
          id: editingEmployee.id
        });
        message.success('Employee updated successfully');
      } else {
        await window.electronAPI.insertEmployee(employeeData);
        message.success('Employee added successfully');
      }

      setModalVisible(false);
      form.resetFields();
      setEditingEmployee(null);
      loadEmployees();
    } catch (error) {
      message.error('Failed to save employee');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (record) => {
    setEditingEmployee(record);
    form.setFieldsValue({
      ...record,
      date_hired: record.date_hired ? moment(record.date_hired) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await window.electronAPI.deleteEmployee(id);
      if (res && res.success) {
        message.success('Employee deleted successfully');
        loadEmployees();
      } else {
        throw new Error(res?.error || 'Delete failed');
      }
    } catch (error) {
      message.error('Failed to delete employee');
    }
  };

  const filteredEmployees = Array.isArray(employees) ? employees.filter(employee => {
    const matchesSearch = (
      (employee.first_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (employee.last_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (employee.email || '').toLowerCase().includes(searchText.toLowerCase())
    );
    
    const matchesStatus = filterStatus === 'all' || employee.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  }) : [];

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      sorter: (a, b) => Number(a.id) - Number(b.id),
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => `${record.first_name} ${record.last_name}`,
      sorter: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: v => v || '-',
      filters: departments.map(d => ({ text: d.name, value: d.name })),
      onFilter: (value, record) => record.department === value,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: v => v || 'Staff',
      filters: roles.map(r => ({ text: r.name, value: r.name })),
      onFilter: (value, record) => record.role === value,
    },
    {
      title: 'Date Hired',
      dataIndex: 'date_hired',
      key: 'date_hired',
      render: (date) => moment(date).format('MM/DD/YYYY'),
      sorter: (a, b) => moment(a.date_hired).unix() - moment(b.date_hired).unix(),
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
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Button 
            type="link" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: 'Delete Employee',
                content: 'Are you sure you want to delete this employee?',
                okText: 'Yes',
                okType: 'danger',
                cancelText: 'No',
                onOk: () => handleDelete(record.id)
              });
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const employeeModal = (
    <Modal
      title={editingEmployee ? 'Edit Employee' : 'Add Employee'}
      visible={modalVisible}
      onCancel={() => {
        setModalVisible(false);
        setEditingEmployee(null);
        form.resetFields();
      }}
      footer={null}
      width={800}
      bodyStyle={MODAL_BODY_SCROLL_STYLE}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <FormSection title="Employee Information" icon={<UserOutlined />}>
          <FormGrid>
            <FormCol>
              <Form.Item
                name="first_name"
                label="First Name"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please enter first name' }]}
              >
                <Input />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="middle_name"
                label="Middle Name"
                style={FORM_ITEM_STYLE}
              >
                <Input />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="last_name"
                label="Last Name"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please enter last name' }]}
              >
                <Input />
              </Form.Item>
            </FormCol>
          </FormGrid>
        </FormSection>

        <FormSection title="Contact Information" icon={<MailOutlined />}>
          <FormGrid columns={2}>
            <FormCol>
              <Form.Item
                name="email"
                label="Email"
                style={FORM_ITEM_STYLE}
                rules={[
                  { required: true, message: 'Please enter email' },
                  { type: 'email', message: 'Please enter valid email' }
                ]}
              >
                <Input />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="phone"
                label="Phone"
                style={FORM_ITEM_STYLE}
              >
                <Input />
              </Form.Item>
            </FormCol>
          </FormGrid>
        </FormSection>

        <FormSection title="Employment Details" icon={<IdcardOutlined />}>
          <FormGrid columns={2}>
            <FormCol>
              <Form.Item
                name="department"
                label="Department"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please select department' }]}
              >
                <Select showSearch optionFilterProp="children" placeholder="Select department">
                  {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
                </Select>
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="date_hired"
                label="Date Hired"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please select date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </FormCol>
          </FormGrid>

          <FormGrid>
            <FormCol>
              <Form.Item
                name="salary"
                label="Salary"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please enter salary' }]}
              >
                <Input type="number" prefix={cSym} />
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="role"
                label="Role"
                style={FORM_ITEM_STYLE}
              >
                <Select showSearch optionFilterProp="children" placeholder="Select role" allowClear>
                  {roles.map(r => <Option key={r.id} value={r.name}>{r.name}</Option>)}
                </Select>
              </Form.Item>
            </FormCol>
            <FormCol>
              <Form.Item
                name="status"
                label="Status"
                style={FORM_ITEM_STYLE}
                rules={[{ required: true, message: 'Please select status' }]}
              >
                <Select>
                  <Option value="Active">Active</Option>
                  <Option value="Inactive">Inactive</Option>
                  <Option value="On Leave">On Leave</Option>
                </Select>
              </Form.Item>
            </FormCol>
          </FormGrid>
        </FormSection>

        <DocumentActionBar
          left={
            <Button onClick={() => {
              setModalVisible(false);
              setEditingEmployee(null);
              form.resetFields();
            }}>
              Cancel
            </Button>
          }
        >
          <Button type="primary" htmlType="submit" loading={loading}>
            {editingEmployee ? 'Update' : 'Add'} Employee
          </Button>
        </DocumentActionBar>
      </Form>
    </Modal>
  );

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="Employee List"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingEmployee(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            Add Employee
          </Button>
        }
      >
        <Space className="al-list-toolbar" style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search employees..."
            allowClear
            onSearch={value => setSearchText(value)}
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
        />
      </Card>

      {employeeModal}
    </div>
  );
};

export default EmployeeList;