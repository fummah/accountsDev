import React, { useState } from 'react';
import { Card, Form, Button, Table, DatePicker, Select, Input, Row, Col, message, Steps, Modal } from 'antd';
import { DollarOutlined, CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Step } = Steps;
const { Option } = Select;

const RunPayroll = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [payrollDate, setPayrollDate] = useState(moment());
  const [payPeriod, setPayPeriod] = useState('bi-weekly');
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const columns = [
    {
      title: 'Employee',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name)
    },
    {
      title: 'Regular Hours',
      dataIndex: 'regularHours',
      key: 'regularHours',
      render: (text, record) => (
        <Input
          type="number"
          defaultValue={text}
          onChange={(e) => handleHoursChange(record.key, 'regularHours', e.target.value)}
          style={{ width: '100px' }}
        />
      )
    },
    {
      title: 'Overtime Hours',
      dataIndex: 'overtimeHours',
      key: 'overtimeHours',
      render: (text, record) => (
        <Input
          type="number"
          defaultValue={text}
          onChange={(e) => handleHoursChange(record.key, 'overtimeHours', e.target.value)}
          style={{ width: '100px' }}
        />
      )
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      key: 'rate',
      render: value => '$' + value.toFixed(2) + '/hr'
    },
    {
      title: 'Gross Pay',
      key: 'grossPay',
      render: (_, record) => {
        const regular = record.regularHours * record.rate;
        const overtime = record.overtimeHours * (record.rate * 1.5);
        return '$' + (regular + overtime).toFixed(2);
      }
    },
    {
      title: 'Deductions',
      dataIndex: 'deductions',
      key: 'deductions',
      render: value => '$' + value.toFixed(2)
    },
    {
      title: 'Net Pay',
      key: 'netPay',
      render: (_, record) => {
        const regular = record.regularHours * record.rate;
        const overtime = record.overtimeHours * (record.rate * 1.5);
        const gross = regular + overtime;
        return '$' + (gross - record.deductions).toFixed(2);
      }
    }
  ];

  // Sample data - replace with actual data from your backend
  const employeeData = [
    {
      key: '1',
      name: 'John Doe',
      regularHours: 80,
      overtimeHours: 5,
      rate: 25.00,
      deductions: 450.00
    },
    {
      key: '2',
      name: 'Jane Smith',
      regularHours: 80,
      overtimeHours: 0,
      rate: 30.00,
      deductions: 520.00
    },
    {
      key: '3',
      name: 'Mike Johnson',
      regularHours: 75,
      overtimeHours: 8,
      rate: 22.00,
      deductions: 380.00
    }
  ];

  const handleHoursChange = (key, type, value) => {
    const newData = [...employeeData];
    const target = newData.find(item => item.key === key);
    if (target) {
      target[type] = parseFloat(value) || 0;
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      setConfirmModalVisible(true);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handlePayrollSubmit = async () => {
    setLoading(true);
    try {
      // TODO: Implement payroll submission to backend
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulated API call
      message.success('Payroll processed successfully');
      setConfirmModalVisible(false);
      // Reset or redirect as needed
    } catch (error) {
      message.error('Failed to process payroll');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      title: 'Select Pay Period',
      content: (
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Pay Date">
                <DatePicker
                  value={payrollDate}
                  onChange={setPayrollDate}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Pay Period">
                <Select value={payPeriod} onChange={setPayPeriod} style={{ width: '100%' }}>
                  <Option value="weekly">Weekly</Option>
                  <Option value="bi-weekly">Bi-weekly</Option>
                  <Option value="monthly">Monthly</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )
    },
    {
      title: 'Review Hours',
      content: (
        <Table
          columns={columns}
          dataSource={employeeData}
          pagination={false}
          scroll={{ x: true }}
        />
      )
    },
    {
      title: 'Confirm & Submit',
      content: (
        <Card>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card title="Pay Period Summary">
                <p>Pay Date: {payrollDate.format('MM/DD/YYYY')}</p>
                <p>Period: {payPeriod}</p>
                <p>Total Employees: {employeeData.length}</p>
              </Card>
            </Col>
            <Col span={8}>
              <Card title="Totals">
                <p>Gross Pay: $7,850.00</p>
                <p>Total Deductions: $1,350.00</p>
                <p>Net Pay: $6,500.00</p>
              </Card>
            </Col>
            <Col span={8}>
              <Card title="Payment Method">
                <p>Direct Deposit: {employeeData.length} employees</p>
                <p>Check: 0 employees</p>
              </Card>
            </Col>
          </Row>
        </Card>
      )
    }
  ];

  return (
    <Card title="Run Payroll">
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        {steps.map(item => (
          <Step key={item.title} title={item.title} />
        ))}
      </Steps>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        {steps[currentStep].content}
      </div>

      <div style={{ marginTop: 24 }}>
        {currentStep > 0 && (
          <Button style={{ marginRight: 8 }} onClick={handlePrev}>
            Previous
          </Button>
        )}
        <Button
          type="primary"
          onClick={handleNext}
        >
          {currentStep === steps.length - 1 ? 'Submit Payroll' : 'Next'}
        </Button>
      </div>

      <Modal
        title="Confirm Payroll Submission"
        visible={confirmModalVisible}
        onOk={handlePayrollSubmit}
        onCancel={() => setConfirmModalVisible(false)}
        confirmLoading={loading}
      >
        <p>Are you sure you want to process payroll for {employeeData.length} employees?</p>
        <p>Total Net Pay: $6,500.00</p>
        <p>This action cannot be undone.</p>
      </Modal>
    </Card>
  );
};

export default RunPayroll;