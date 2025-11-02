import React, { useState, useEffect } from 'react';
import { Table, Button, DatePicker, Card, Space, message, Modal, Form, Input, Select } from 'antd';
import { DollarOutlined, CheckOutlined, CalendarOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const RunPayroll = () => {
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [payPeriod, setPayPeriod] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await window.electronAPI.getEmployees();
      setEmployees(data);
    } catch (error) {
      message.error('Failed to load employees');
    }
  };

  const handlePayrollRun = () => {
    if (!payPeriod[0] || !payPeriod[1]) {
      message.error('Please select a pay period');
      return;
    }
    if (selectedEmployees.length === 0) {
      message.error('Please select at least one employee');
      return;
    }
    setShowConfirm(true);
  };

  const processPayroll = async (values) => {
    try {
      setLoading(true);
      const payrollData = {
        payPeriodStart: payPeriod[0].format('YYYY-MM-DD'),
        payPeriodEnd: payPeriod[1].format('YYYY-MM-DD'),
        employeeIds: selectedEmployees,
        ...values,
        createdAt: moment().format('YYYY-MM-DD HH:mm:ss'),
      };

      await window.electronAPI.processPayroll(payrollData);
      message.success('Payroll processed successfully');
      setShowConfirm(false);
      setSelectedEmployees([]);
      setPayPeriod([]);
      form.resetFields();
    } catch (error) {
      message.error('Failed to process payroll');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Employee ID',
      dataIndex: 'employeeId',
      key: 'employeeId',
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => `${record.firstName} ${record.lastName}`,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: 'Pay Type',
      dataIndex: 'payType',
      key: 'payType',
    },
    {
      title: 'Base Pay',
      dataIndex: 'basePay',
      key: 'basePay',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Last Paid',
      dataIndex: 'lastPaidDate',
      key: 'lastPaidDate',
      render: (date) => date ? moment(date).format('MM/DD/YYYY') : 'Never',
    },
  ];

  const confirmModal = (
    <Modal
      title="Confirm Payroll Run"
      visible={showConfirm}
      onCancel={() => setShowConfirm(false)}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={processPayroll}
      >
        <Form.Item
          name="paymentMethod"
          label="Payment Method"
          rules={[{ required: true, message: 'Please select payment method' }]}
        >
          <Select placeholder="Select payment method">
            <Option value="direct_deposit">Direct Deposit</Option>
            <Option value="check">Check</Option>
            <Option value="cash">Cash</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="bankAccount"
          label="Bank Account"
          rules={[{ required: true, message: 'Please select bank account' }]}
        >
          <Select placeholder="Select bank account">
            <Option value="main">Main Account</Option>
            <Option value="payroll">Payroll Account</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea rows={4} placeholder="Enter any additional notes" />
        </Form.Item>

        <Form.Item>
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Process Payroll
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  return (
    <div style={{ padding: '24px' }}>
      <h2>Run Payroll</h2>

      <Card style={{ marginBottom: '24px' }}>
        <Space size="large">
          <RangePicker
            value={payPeriod}
            onChange={setPayPeriod}
            style={{ width: 300 }}
            placeholder={['Start Date', 'End Date']}
          />

          <Button 
            type="primary"
            icon={<DollarOutlined />}
            onClick={handlePayrollRun}
            disabled={!payPeriod[0] || !payPeriod[1] || selectedEmployees.length === 0}
          >
            Run Payroll
          </Button>

          <Button 
            icon={<CalendarOutlined />}
            onClick={() => window.electronAPI.openPayrollCalendar()}
          >
            View Payroll Calendar
          </Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={employees}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedEmployees,
          onChange: setSelectedEmployees,
        }}
        loading={loading}
      />

      {confirmModal}
    </div>
  );
};

export default RunPayroll;