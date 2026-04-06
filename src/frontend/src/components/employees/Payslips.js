import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Select, Modal, Descriptions, Divider, message, Tag, Row, Col, Statistic } from 'antd';
import { PrinterOutlined, FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const Payslips = () => {
  const { symbol: cSym } = useCurrency();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewSlip, setViewSlip] = useState(null);
  const [company, setCompany] = useState({});

  useEffect(() => {
    loadRuns();
    loadCompany();
  }, []);

  const loadRuns = async () => {
    try {
      const result = await window.electronAPI.getPayrollRecords?.();
      if (result?.success) setRuns(result.data || []);
    } catch {}
  };

  const loadCompany = async () => {
    try {
      const c = await window.electronAPI.getCompany?.();
      if (c) setCompany(c);
    } catch {}
  };

  const loadPayslips = async (runId) => {
    setLoading(true);
    setSelectedRun(runId);
    try {
      const result = await window.electronAPI.payrollPayslipsForRun?.(runId);
      if (result?.success) setPayslips(result.data || []);
      else message.error(result?.error || 'Failed to load payslips');
    } catch (e) {
      message.error(e?.message || 'Error');
    } finally { setLoading(false); }
  };

  const viewPayslip = async (record) => {
    try {
      const result = await window.electronAPI.payrollPayslipGet?.({ payrollRunId: record.payroll_run_id, employeeId: record.employee_id });
      if (result?.success) setViewSlip(result.data);
      else message.error(result?.error || 'Failed to load payslip');
    } catch (e) {
      message.error(e?.message || 'Error');
    }
  };

  const printPayslip = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow || !viewSlip) return;
    const s = viewSlip;
    const html = `<!DOCTYPE html><html><head><title>Payslip</title><style>
      body { font-family: Arial, sans-serif; padding: 40px; max-width: 700px; margin: auto; }
      h1 { text-align: center; margin-bottom: 4px; }
      .company { text-align: center; color: #666; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; }
      th { background: #f5f5f5; }
      .total { font-weight: bold; background: #e6f7ff; }
      .net { font-size: 18px; font-weight: bold; color: #1890ff; }
      @media print { body { padding: 20px; } }
    </style></head><body>
      <h1>PAYSLIP</h1>
      <div class="company">${company.company_name || 'Company'}</div>
      <table>
        <tr><th>Employee</th><td>${s.first_name || ''} ${s.last_name || ''}</td><th>Employee ID</th><td>${s.employee_id || ''}</td></tr>
        <tr><th>Email</th><td>${s.email || ''}</td><th>Payment Method</th><td>${s.payment_method || 'Bank Transfer'}</td></tr>
        <tr><th>Pay Period</th><td colspan="3">${s.pay_period_start || ''} to ${s.pay_period_end || ''}</td></tr>
        <tr><th>Processed Date</th><td colspan="3">${s.processed_date || ''}</td></tr>
      </table>
      <table>
        <tr><th colspan="2">Earnings</th></tr>
        <tr><td>Base Salary / Rate</td><td>${cSym} ${(Number(s.base_salary) || 0).toFixed(2)}</td></tr>
        <tr><td>Hours Worked</td><td>${s.hours_worked || 0}</td></tr>
        <tr><td>Overtime Hours</td><td>${s.overtime_hours || 0}</td></tr>
        <tr class="total"><td>Gross Pay</td><td>${cSym} ${(Number(s.gross_pay) || 0).toFixed(2)}</td></tr>
      </table>
      <table>
        <tr><th colspan="2">Deductions</th></tr>
        <tr><td>Tax Deductions</td><td>${cSym} ${(Number(s.tax_deductions) || 0).toFixed(2)}</td></tr>
        <tr><td>Other Deductions</td><td>${cSym} ${(Number(s.other_deductions) || 0).toFixed(2)}</td></tr>
        <tr class="total"><td>Total Deductions</td><td>${cSym} ${((Number(s.tax_deductions) || 0) + (Number(s.other_deductions) || 0)).toFixed(2)}</td></tr>
      </table>
      <table>
        <tr class="total"><td class="net">NET PAY</td><td class="net">${cSym} ${(Number(s.net_pay) || 0).toFixed(2)}</td></tr>
      </table>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const columns = [
    { title: 'Employee', key: 'name', render: (_, r) => `${r.first_name || ''} ${r.last_name || ''}` },
    { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
    { title: 'Gross Pay', dataIndex: 'gross_pay', key: 'gross', width: 110, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Tax', dataIndex: 'tax_deductions', key: 'tax', width: 100, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Other Ded.', dataIndex: 'other_deductions', key: 'other', width: 100, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Net Pay', dataIndex: 'net_pay', key: 'net', width: 110, render: v => <strong style={{ color: '#1890ff' }}>{cSym} {(Number(v) || 0).toFixed(2)}</strong> },
    { title: 'Status', dataIndex: 'payment_status', key: 'status', width: 90, render: v => <Tag color={v === 'Processed' ? 'green' : 'default'}>{v || 'Pending'}</Tag> },
    { title: 'Actions', key: 'actions', width: 120, render: (_, r) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => viewPayslip(r)}>View</Button>
    )},
  ];

  return (
    <div className="gx-p-4">
      <Card title={<span><FileTextOutlined /> Payslips</span>}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>Select Payroll Run:</span>
          <Select
            placeholder="Choose a payroll run"
            style={{ width: 400 }}
            value={selectedRun}
            onChange={loadPayslips}
          >
            {runs.map(r => (
              <Select.Option key={r.id} value={r.id}>
                Run #{r.id} — {r.payPeriodStart} to {r.payPeriodEnd} ({r.paymentsCount} employees)
              </Select.Option>
            ))}
          </Select>
        </div>

        <Table dataSource={payslips} columns={columns} rowKey="id" loading={loading} size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} payslips` }} />
      </Card>

      <Modal
        title="Payslip Detail"
        open={!!viewSlip}
        onCancel={() => setViewSlip(null)}
        footer={[
          <Button key="close" onClick={() => setViewSlip(null)}>Close</Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printPayslip}>Print Payslip</Button>
        ]}
        width={650}
      >
        {viewSlip && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Employee" span={2}>{viewSlip.first_name} {viewSlip.last_name}</Descriptions.Item>
              <Descriptions.Item label="Email">{viewSlip.email}</Descriptions.Item>
              <Descriptions.Item label="Employee ID">{viewSlip.employee_id}</Descriptions.Item>
              <Descriptions.Item label="Pay Period" span={2}>{viewSlip.pay_period_start} to {viewSlip.pay_period_end}</Descriptions.Item>
              <Descriptions.Item label="Processed">{viewSlip.processed_date}</Descriptions.Item>
              <Descriptions.Item label="Payment Method">{viewSlip.payment_method || 'Bank Transfer'}</Descriptions.Item>
            </Descriptions>

            <Divider>Earnings</Divider>
            <Row gutter={16}>
              <Col span={8}><Statistic title="Base Salary/Rate" value={Number(viewSlip.base_salary) || 0} precision={2} prefix={cSym} /></Col>
              <Col span={8}><Statistic title="Hours Worked" value={viewSlip.hours_worked || 0} /></Col>
              <Col span={8}><Statistic title="Overtime Hours" value={viewSlip.overtime_hours || 0} /></Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 12 }}>
              <Col span={8}><Statistic title="Gross Pay" value={Number(viewSlip.gross_pay) || 0} precision={2} prefix={cSym} valueStyle={{ color: '#3f8600' }} /></Col>
            </Row>

            <Divider>Deductions</Divider>
            <Row gutter={16}>
              <Col span={8}><Statistic title="Tax" value={Number(viewSlip.tax_deductions) || 0} precision={2} prefix={cSym} valueStyle={{ color: '#cf1322' }} /></Col>
              <Col span={8}><Statistic title="Other Deductions" value={Number(viewSlip.other_deductions) || 0} precision={2} prefix={cSym} valueStyle={{ color: '#cf1322' }} /></Col>
              <Col span={8}><Statistic title="Total Deductions" value={(Number(viewSlip.tax_deductions) || 0) + (Number(viewSlip.other_deductions) || 0)} precision={2} prefix={cSym} valueStyle={{ color: '#cf1322' }} /></Col>
            </Row>

            <Divider>Net Pay</Divider>
            <Row>
              <Col span={24} style={{ textAlign: 'center' }}>
                <Statistic title="NET PAY" value={Number(viewSlip.net_pay) || 0} precision={2} prefix={cSym} valueStyle={{ color: '#1890ff', fontSize: 28 }} />
              </Col>
            </Row>
          </>
        )}
      </Modal>
    </div>
  );
};

export default Payslips;
