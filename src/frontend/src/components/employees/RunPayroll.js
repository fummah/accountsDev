import React, { useState, useEffect } from 'react';
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
  const [employees, setEmployees] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);

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
      render: value => '$' + (typeof value === 'number' && !isNaN(value) ? value.toFixed(2) : '0.00') + '/hr'
    },
    {
      title: 'Gross Pay',
      key: 'grossPay',
      render: (_, record) => {
        const regular = Number(record.regularHours) * Number(record.rate);
        const overtime = Number(record.overtimeHours) * (Number(record.rate) * 1.5);
        const gross = regular + overtime;
        return '$' + (!isNaN(gross) ? gross.toFixed(2) : '0.00');
      }
    },
    {
      title: 'Deductions',
      dataIndex: 'deductions',
      key: 'deductions',
      render: value => '$' + (typeof value === 'number' && !isNaN(value) ? value.toFixed(2) : '0.00')
    },
    {
      title: 'Net Pay',
      key: 'netPay',
      render: (_, record) => {
        const regular = Number(record.regularHours) * Number(record.rate);
        const overtime = Number(record.overtimeHours) * (Number(record.rate) * 1.5);
        const gross = regular + overtime;
        const deductions = Number(record.deductions);
        const net = gross - deductions;
        return '$' + (!isNaN(net) ? net.toFixed(2) : '0.00');
      }
    }
  ];

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const response = await window.electronAPI.getAllEmployees();
        if (response.success) {
          const list = response.data || [];
          setEmployees(list);
          // Initialize editable payroll rows from employees
          const rows = list.map(emp => ({
            key: emp.id,
            id: emp.id,
            first_name: emp.first_name,
            last_name: emp.last_name,
            name: `${emp.first_name} ${emp.last_name}`,
            regularHours: 80,
            overtimeHours: 0,
            rate: typeof emp.salary === 'number' ? emp.salary : parseFloat(emp.salary) || 0,
            deductions: 0
          }));
          setPayrollRows(rows);
        } else {
          setEmployees([]);
          setPayrollRows([]);
        }
      } catch (error) {
        setEmployees([]);
        setPayrollRows([]);
      }
    }
    fetchEmployees();
  }, []);

  const handleHoursChange = (key, type, value) => {
    setPayrollRows(prev => {
      return prev.map(r => {
        if (r.key === key) {
          return { ...r, [type]: parseFloat(value) || 0 };
        }
        return r;
      });
    });
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
      // Prepare payload
      const payload = {
        payPeriodStart: payrollDate.startOf('day').format('YYYY-MM-DD'),
        payPeriodEnd: payrollDate.startOf('day').format('YYYY-MM-DD'),
        processedDate: payrollDate.format('YYYY-MM-DD'),
        paymentMethod: 'direct_deposit',
        notes: null,
        rows: payrollRows.map(r => ({
          id: r.id,
          regularHours: r.regularHours,
          overtimeHours: r.overtimeHours,
          rate: r.rate,
          deductions: r.deductions
        }))
      };

      const result = await window.electronAPI.processPayroll(payload);
      if (result && result.success) {
        message.success(result.message || 'Payroll processed successfully');
        setConfirmModalVisible(false);
        // reload payroll records if needed
        // loadPayrollRecords(); // optional: call if payroll page shows history
      } else {
        throw new Error(result?.error || 'Failed to process payroll');
      }
    } catch (error) {
      console.error('Error processing payroll:', error);
      message.error(error.message || 'Failed to process payroll');
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
          dataSource={payrollRows}
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
                <p>Total Employees: {payrollRows.length}</p>
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
                <p>Direct Deposit: {payrollRows.length} employees</p>
                <p>Check: 0 employees</p>
              </Card>
            </Col>
          </Row>
        </Card>
      )
    }
  ];

  const employeeData = employees.map(emp => ({
    key: emp.id,
    name: `${emp.first_name} ${emp.last_name}`,
    regularHours: 80, // You can add a field to input/edit this per employee
    overtimeHours: 0, // You can add a field to input/edit this per employee
    rate: typeof emp.salary === 'number' ? emp.salary : parseFloat(emp.salary) || 0,
    deductions: typeof emp.deductions === 'number' ? emp.deductions : parseFloat(emp.deductions) || 0
  }));

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
        <p>Are you sure you want to process payroll for {employees.length} employees?</p>
        <p>Total Net Pay: $6,500.00</p>
        <p>This action cannot be undone.</p>
      </Modal>
    </Card>
  );
};

export default RunPayroll;