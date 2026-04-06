import React, { useState, useEffect, useMemo } from 'react';
import { Card, Form, Button, Table, DatePicker, Select, Input, InputNumber, Row, Col, message, Steps, Modal, Statistic, Tag, Space, Divider } from 'antd';
import { DollarOutlined, CheckOutlined, ReloadOutlined, PrinterOutlined, TeamOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Step } = Steps;
const { Option } = Select;

const RunPayroll = () => {
  const { symbol: cSym } = useCurrency();
  const fmtR = v => `${cSym} ${Number(v || 0).toFixed(2)}`;
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [payrollDate, setPayrollDate] = useState(moment());
  const [payPeriod, setPayPeriod] = useState('monthly');
  const [paymentMethod, setPaymentMethod] = useState('direct_deposit');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [stepLoading, setStepLoading] = useState(false);

  const calcGross = (r) => {
    const regular = Number(r.regularHours || 0) * Number(r.rate || 0);
    const overtime = Number(r.overtimeHours || 0) * (Number(r.rate || 0) * 1.5);
    return regular + overtime;
  };
  const calcNet = (r) => calcGross(r) - Number(r.deductions || 0);

  const payrollTotals = useMemo(() => {
    let gross = 0, deductions = 0, net = 0;
    payrollRows.forEach(r => { gross += calcGross(r); deductions += Number(r.deductions || 0); net += calcNet(r); });
    return { gross, deductions, net, count: payrollRows.length };
  }, [payrollRows]);

  const columns = [
    { title: 'Employee', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || ''), render: v => <strong>{v}</strong> },
    { title: 'Regular Hours', dataIndex: 'regularHours', key: 'regularHours',
      render: (text, record) => <InputNumber value={text} min={0} onChange={v => handleChange(record.key, 'regularHours', v)} style={{ width: 90 }} /> },
    { title: 'Overtime Hours', dataIndex: 'overtimeHours', key: 'overtimeHours',
      render: (text, record) => <InputNumber value={text} min={0} onChange={v => handleChange(record.key, 'overtimeHours', v)} style={{ width: 90 }} /> },
    { title: 'Rate (R/hr)', dataIndex: 'rate', key: 'rate',
      render: (v, record) => <InputNumber value={v} min={0} step={10} onChange={val => handleChange(record.key, 'rate', val)} style={{ width: 100 }} /> },
    { title: 'Deductions', dataIndex: 'deductions', key: 'deductions',
      render: (v, record) => <InputNumber value={v} min={0} onChange={val => handleChange(record.key, 'deductions', val)} style={{ width: 100 }} /> },
    { title: 'Gross Pay', key: 'grossPay', align: 'right', render: (_, r) => fmtR(calcGross(r)) },
    { title: 'Net Pay', key: 'netPay', align: 'right', render: (_, r) => <strong style={{ color: '#3f8600' }}>{fmtR(calcNet(r))}</strong> },
  ];

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const response = await window.electronAPI.getAllEmployees();
        if (response.success) {
          const list = response.data || [];
          setEmployees(list);
          const rows = list.filter(e => e.status === 'Active' || !e.status).map(emp => ({
            key: emp.id, id: emp.id,
            name: `${emp.first_name} ${emp.last_name}`,
            regularHours: 160, overtimeHours: 0,
            rate: typeof emp.salary === 'number' ? emp.salary : parseFloat(emp.salary) || 0,
            deductions: 0,
          }));
          setPayrollRows(rows);
        } else { setEmployees([]); setPayrollRows([]); }
      } catch (_) { setEmployees([]); setPayrollRows([]); }
    }
    fetchEmployees();
    loadPayrollRecords();
  }, []);

  const loadPayrollRecords = async () => {
    try {
      const response = await window.electronAPI.getPayrollRecords();
      if (response && response.success) { setPayrollRecords(response.data || []); }
      else if (Array.isArray(response)) { setPayrollRecords(response); }
      else { setPayrollRecords([]); }
    } catch (_) { setPayrollRecords([]); }
  };

  const handleChange = (key, field, value) => {
    setPayrollRows(prev => prev.map(r => r.key === key ? { ...r, [field]: parseFloat(value) || 0 } : r));
  };

  const handleNext = () => {
    if (currentStep === 2) { setConfirmModalVisible(true); return; }
    setStepLoading(true);
    setTimeout(() => {
      setCurrentStep(currentStep + 1);
      setStepLoading(false);
    }, 400);
  };

  const handlePayrollSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        payPeriodStart: payrollDate.startOf('month').format('YYYY-MM-DD'),
        payPeriodEnd: payrollDate.endOf('month').format('YYYY-MM-DD'),
        processedDate: payrollDate.format('YYYY-MM-DD'),
        paymentMethod,
        notes: null,
        rows: payrollRows.map(r => ({
          id: r.id, regularHours: r.regularHours, overtimeHours: r.overtimeHours,
          rate: r.rate, deductions: r.deductions,
        })),
      };
      const result = await window.electronAPI.processPayroll(payload);
      if (result && result.success) {
        message.success(result.message || 'Payroll processed successfully');
        setConfirmModalVisible(false);
        setCurrentStep(0);
        loadPayrollRecords();
      } else {
        throw new Error(result?.error || 'Failed to process payroll');
      }
    } catch (error) {
      message.error(error.message || 'Failed to process payroll');
    } finally { setLoading(false); }
  };

  const steps = [
    {
      title: 'Pay Period',
      content: (
        <Card size="small">
          <Form layout="vertical">
            <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={8}>
                <Form.Item label="Pay Date"><DatePicker value={payrollDate} onChange={setPayrollDate} style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Pay Period">
                  <Select value={payPeriod} onChange={setPayPeriod} style={{ width: '100%' }}>
                    <Option value="weekly">Weekly</Option>
                    <Option value="bi-weekly">Bi-weekly</Option>
                    <Option value="monthly">Monthly</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Payment Method">
                  <Select value={paymentMethod} onChange={setPaymentMethod} style={{ width: '100%' }}>
                    <Option value="direct_deposit">Direct Deposit (EFT)</Option>
                    <Option value="cheque">Cheque</Option>
                    <Option value="cash">Cash</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
          <Row gutter={16} style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={6}><Statistic title="Employees" value={payrollRows.length} prefix={<TeamOutlined />} /></Col>
            <Col span={6}><Statistic title="Total Gross" value={payrollTotals.gross} prefix={cSym} precision={2} /></Col>
            <Col span={6}><Statistic title="Total Deductions" value={payrollTotals.deductions} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} /></Col>
            <Col span={6}><Statistic title="Total Net Pay" value={payrollTotals.net} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} /></Col>
          </Row>
        </Card>
      ),
    },
    {
      title: 'Review Hours & Pay',
      content: (
        <Table columns={columns} dataSource={payrollRows} pagination={false} scroll={{ x: true }} size="middle" rowKey="key"
          summary={() => (
            <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
              <Table.Summary.Cell colSpan={5}>Totals</Table.Summary.Cell>
              <Table.Summary.Cell align="right">{fmtR(payrollTotals.gross)}</Table.Summary.Cell>
              <Table.Summary.Cell align="right"><span style={{ color: '#3f8600' }}>{fmtR(payrollTotals.net)}</span></Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
      ),
    },
    {
      title: 'Confirm & Submit',
      content: (
        <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={8}>
            <Card title="Pay Period Summary" size="small">
              <p><strong>Pay Date:</strong> {payrollDate.format('DD/MM/YYYY')}</p>
              <p><strong>Period:</strong> {payPeriod}</p>
              <p><strong>Method:</strong> {paymentMethod.replace('_', ' ')}</p>
              <p><strong>Employees:</strong> {payrollRows.length}</p>
            </Card>
          </Col>
          <Col span={8}>
            <Card title="Financial Totals" size="small">
              <Statistic title="Gross Pay" value={payrollTotals.gross} prefix={cSym} precision={2} style={{ marginBottom: 8 }} />
              <Statistic title="Deductions" value={payrollTotals.deductions} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} style={{ marginBottom: 8 }} />
              <Divider style={{ margin: '8px 0' }} />
              <Statistic title="Net Pay" value={payrollTotals.net} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600', fontSize: 24 }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card title="Per Employee Average" size="small">
              <Statistic title="Avg Gross" value={payrollRows.length ? payrollTotals.gross / payrollRows.length : 0} prefix={cSym} precision={2} style={{ marginBottom: 8 }} />
              <Statistic title="Avg Net" value={payrollRows.length ? payrollTotals.net / payrollRows.length : 0} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  const recordColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Pay Period', key: 'payPeriod',
      render: (_, r) => `${r.payPeriodStart || r.pay_period_start || '-'} — ${r.payPeriodEnd || r.pay_period_end || '-'}` },
    { title: 'Processed', dataIndex: 'processedDate', key: 'processedDate',
      render: (d, r) => { const v = d || r.processed_date || r.created_at || ''; return v ? moment(v).format('DD/MM/YYYY') : '-'; } },
    { title: 'Net Paid', dataIndex: 'totalNetPay', key: 'totalNetPay', align: 'right',
      render: (amount, r) => <strong>{fmtR(amount ?? r.total_net_pay ?? 0)}</strong> },
    { title: 'Employees', dataIndex: 'paymentsCount', key: 'paymentsCount', width: 90,
      render: (v, r) => v ?? r.payments_count ?? 0 },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={v === 'completed' || v === 'processed' ? 'green' : v === 'draft' ? 'orange' : 'default'}>{(v || 'processed').toUpperCase()}</Tag> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Run Payroll</span>}
        extra={<Button icon={<ReloadOutlined />} onClick={loadPayrollRecords}>Refresh</Button>}>

        <Steps current={currentStep} style={{ marginBottom: 24 }}>
          {steps.map(item => <Step key={item.title} title={item.title} />)}
        </Steps>

        <div style={{ marginTop: 16, marginBottom: 16 }}>{steps[currentStep].content}</div>

        <Space>
          {currentStep > 0 && <Button onClick={() => setCurrentStep(currentStep - 1)}>Previous</Button>}
          <Button type="primary" onClick={handleNext} loading={stepLoading}>
            {currentStep === steps.length - 1 ? 'Submit Payroll' : 'Next'}
          </Button>
        </Space>

        <Modal title="Confirm Payroll Submission" visible={confirmModalVisible}
          onOk={handlePayrollSubmit} onCancel={() => setConfirmModalVisible(false)} confirmLoading={loading}
          okText="Process Payroll" okButtonProps={{ danger: false }}>
          <p>Process payroll for <strong>{payrollRows.length}</strong> employees?</p>
          <Statistic title="Total Net Pay" value={payrollTotals.net} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600', fontSize: 28 }} />
          <p style={{ marginTop: 12, color: '#888' }}>This action will create payroll records and cannot be undone.</p>
        </Modal>
      </Card>

      <Card title="Recent Payroll Runs" style={{ marginTop: 16 }} size="small">
        <Table columns={recordColumns} dataSource={payrollRecords} rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: true }} size="small" />
      </Card>
    </div>
  );
};

export default RunPayroll;