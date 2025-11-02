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
      const data = await window.electronAPI.getAllEmployees();
      setEmployees(data);
    } catch (error) {
      message.error('Failed to load employees');
    }
  };

  const loadPayrollRecords = async () => {
    try {
      // TODO: Implement getPayrollRecords in the backend
      const data = [];
      setPayrollRecords(data);
    } catch (error) {
      message.error('Failed to load payroll records');
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
      title: 'Employee',
      dataIndex: 'employeeName',
      key: 'employeeName',
    },
    {
      title: 'Pay Period',
      key: 'payPeriod',
      render: (_, record) => `${moment(record.payPeriodStart).format('MM/DD/YYYY')} - ${moment(record.payPeriodEnd).format('MM/DD/YYYY')}`,
    },
    {
      title: 'Basic Pay',
      dataIndex: 'basicPay',
      key: 'basicPay',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Overtime',
      dataIndex: 'overtime',
      key: 'overtime',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Deductions',
      dataIndex: 'deductions',
      key: 'deductions',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Net Pay',
      dataIndex: 'netPay',
      key: 'netPay',
      render: (amount) => `$${amount.toFixed(2)}`,
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
            <strong>Last Payroll Date:</strong> {payrollRecords[0]?.processedDate || 'N/A'}
          </div>
        </div>
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