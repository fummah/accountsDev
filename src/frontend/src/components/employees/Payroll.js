import React, { useState, useEffect } from 'react';
import { Table, Button, Form, DatePicker, Select, Input, Modal, Card, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;

const Payroll = () => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadEmployees();
    loadPayrollRecords();
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await window.electronAPI.getAllEmployees();
      console.log('Employees response:', response);

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch employees');
      }

      setEmployees(response.data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      message.error(error.message || 'Failed to load employees');
      setEmployees([]);
    }
  };

  const loadPayrollRecords = async () => {
    try {
      const response = await window.electronAPI.getPayrollRecords();
      console.log('Payroll records response:', response);

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch payroll records');
      }

      setPayrollRecords(response.data || []);
    } catch (error) {
      console.error('Error loading payroll records:', error);
      message.error(error.message || 'Failed to load payroll records');
      setPayrollRecords([]);
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const payrollData = {
        ...values,
        payPeriodStart: values.payPeriod[0].format('YYYY-MM-DD'),
        payPeriodEnd: values.payPeriod[1].format('YYYY-MM-DD'),
        processedDate: moment().format('YYYY-MM-DD'),
      };

      // TODO: Implement processPayroll in the backend
      await window.electronAPI.processPayroll(payrollData);
      message.success('Payroll processed successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadPayrollRecords();
    } catch (error) {
      message.error('Failed to process payroll');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Run ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: 'Pay Period',
      key: 'payPeriod',
      render: (_, record) => `${moment(record.payPeriodStart || record.startDate).format('MM/DD/YYYY')} - ${moment(record.payPeriodEnd || record.endDate).format('MM/DD/YYYY')}`,
    },
    {
      title: 'Total Net Paid',
      dataIndex: 'totalNetPay',
      key: 'totalNetPay',
      render: (amount) => `$${Number(amount || 0).toFixed(2)}`,
    },
    {
      title: 'Payments',
      dataIndex: 'paymentsCount',
      key: 'paymentsCount',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Payroll Management</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setIsModalVisible(true)}
        >
          Process Payroll
        </Button>
      </div>

      <Card style={{ marginBottom: '24px' }}>
        <h3>Quick Summary</h3>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div>
            <strong>Total Employees:</strong> {employees.length}
          </div>
          <div>
            <strong>Last Payroll Date:</strong> {payrollRecords[0]?.created_at || payrollRecords[0]?.payPeriodEnd || 'N/A'}
          </div>
        </div>
      </Card>

      {/* Payroll Preview Table for selected employees */}
      <Card style={{ marginBottom: '24px' }}>
        <h3>Payroll Preview</h3>
        <Table
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Salary', dataIndex: 'salary', key: 'salary', render: (val) => `$${Number(val).toFixed(2)}` },
            { title: 'Status', dataIndex: 'status', key: 'status' },
            { title: 'Role', dataIndex: 'role', key: 'role' },
            { title: 'Email', dataIndex: 'email', key: 'email' },
            { title: 'Phone', dataIndex: 'phone', key: 'phone' },
          ]}
          dataSource={employees.map(emp => ({
            key: emp.id,
            name: `${emp.first_name} ${emp.last_name}`,
            salary: emp.salary,
            status: emp.status,
            role: emp.role,
            email: emp.email,
            phone: emp.phone
          }))}
          pagination={false}
        />
      </Card>

      <Table 
        columns={columns} 
        dataSource={payrollRecords}
        rowKey="id"
      />

      <Modal
        title="Process Payroll"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={800}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="payPeriod"
            label="Pay Period"
            rules={[{ required: true, message: 'Please select pay period!' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="employeeIds"
            label="Select Employees"
            rules={[{ required: true, message: 'Please select employees!' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select employees to process payroll"
            >
              {employees.map(emp => (
                <Option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="paymentMethod"
            label="Payment Method"
            rules={[{ required: true, message: 'Please select payment method!' }]}
          >
            <Select>
              <Option value="direct_deposit">Direct Deposit</Option>
              <Option value="check">Check</Option>
              <Option value="cash">Cash</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Payroll;