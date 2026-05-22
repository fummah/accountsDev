import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, DatePicker, Input, message, Tag, Space, Row, Col, Statistic, Tabs, InputNumber } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, PlayCircleOutlined, PauseCircleOutlined, LinkOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const TimeAttendance = () => {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clockInVisible, setClockInVisible] = useState(false);
  const [calcVisible, setCalcVisible] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [policyVisible, setPolicyVisible] = useState(false);
  const [policy, setPolicy] = useState({});
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [form] = Form.useForm();
  const [policyForm] = Form.useForm();

  useEffect(() => { loadData(); }, [dateRange, selectedEmp]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [e, r, p] = await Promise.all([
        window.electronAPI.getEmployees?.() || [],
        window.electronAPI.attendanceList?.(selectedEmp, dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD')) || [],
        window.electronAPI.attendancePolicyGet?.() || {},
      ]);
      setEmployees(Array.isArray(e) ? e : (e?.all || []));
      setRecords(Array.isArray(r) ? r : []);
      setPolicy(p || {});
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleClockIn = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.attendanceClockIn?.(vals.employee_id, vals.work_type, vals.notes);
      if (result?.error) { message.error(result.error); return; }
      message.success('Clocked in');
      setClockInVisible(false);
      form.resetFields();
      loadData();
    } catch {}
  };

  const handleClockOut = async (id) => {
    await window.electronAPI.attendanceClockOut?.(id);
    message.success('Clocked out');
    loadData();
  };

  const handleApprove = async (id) => {
    await window.electronAPI.attendanceApprove?.(id, 'admin');
    message.success('Approved');
    loadData();
  };

  const handleCalculate = async (empId) => {
    const result = await window.electronAPI.attendanceCalculate?.(
      empId, dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD')
    );
    if (result?.error) { message.error(result.error); return; }
    setCalcResult(result);
    setCalcVisible(true);
  };

  const handleSavePolicy = async () => {
    const vals = policyForm.getFieldsValue();
    await window.electronAPI.attendancePolicySave?.({ ...policy, ...vals });
    message.success('Policy saved');
    setPolicyVisible(false);
    loadData();
  };

  const columns = [
    { title: 'Employee', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Clock In', dataIndex: 'clock_in', key: 'clock_in', render: v => v ? moment(v).format('MM/DD/YYYY HH:mm') : '' },
    { title: 'Clock Out', dataIndex: 'clock_out', key: 'clock_out', render: v => v ? moment(v).format('MM/DD/YYYY HH:mm') : <Tag color="green">Active</Tag> },
    {
      title: 'Hours', key: 'hours', render: (_, r) => {
        if (!r.clock_in || !r.clock_out) return '—';
        const hrs = (new Date(r.clock_out) - new Date(r.clock_in)) / 3600000 - (r.break_minutes || 0) / 60;
        return hrs.toFixed(2);
      }
    },
    { title: 'Type', dataIndex: 'work_type', key: 'work_type', render: v => <Tag>{v || 'regular'}</Tag> },
    { title: 'Approved', key: 'approved', render: (_, r) => r.approved_by ? <Tag color="green">Yes</Tag> : <Tag color="orange">Pending</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          {!r.clock_out && <Button size="small" icon={<PauseCircleOutlined />} onClick={() => handleClockOut(r.id)}>Clock Out</Button>}
          {!r.approved_by && r.clock_out && <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleApprove(r.id)}>Approve</Button>}
          <Button size="small" danger onClick={async () => { await window.electronAPI.attendanceDelete?.(r.id); loadData(); }}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><ClockCircleOutlined /> Time & Attendance</>}
      extra={
        <Space>
          <Button onClick={() => { policyForm.setFieldsValue(policy); setPolicyVisible(true); }}>Policy</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setClockInVisible(true)}>Clock In</Button>
        </Space>
      }>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Select allowClear placeholder="Filter by employee" style={{ width: '100%' }} value={selectedEmp} onChange={v => setSelectedEmp(v)}>
            {employees.map(e => <Option key={e.id} value={e.id}>{e.first_name} {e.last_name}</Option>)}
          </Select>
        </Col>
        <Col span={8}>
          <RangePicker value={dateRange} onChange={v => setDateRange(v || [moment().startOf('month'), moment()])} style={{ width: '100%' }} />
        </Col>
        <Col span={8}>
          {selectedEmp && <Button icon={<LinkOutlined />} onClick={() => handleCalculate(selectedEmp)}>Calculate Hours</Button>}
        </Col>
      </Row>

      <Table columns={columns} dataSource={records} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal title="Clock In" visible={clockInVisible} onOk={handleClockIn} onCancel={() => setClockInVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select employee"
              filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}>
              {employees.map(e => <Option key={e.id} value={e.id}>{e.first_name} {e.last_name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="work_type" label="Work Type" initialValue="regular">
            <Select><Option value="regular">Regular</Option><Option value="overtime">Overtime</Option><Option value="holiday">Holiday</Option></Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Hours Calculation" visible={calcVisible} onCancel={() => setCalcVisible(false)} footer={null} width={500}>
        {calcResult && (
          <Row gutter={16}>
            <Col span={8}><Statistic title="Regular Hours" value={calcResult.regular_hours} /></Col>
            <Col span={8}><Statistic title="Overtime Hours" value={calcResult.overtime_hours} /></Col>
            <Col span={8}><Statistic title="Total Hours" value={calcResult.total_hours} /></Col>
            <Col span={8} style={{ marginTop: 16 }}><Statistic title="Double Time" value={calcResult.double_time_hours} /></Col>
            <Col span={8} style={{ marginTop: 16 }}><Statistic title="Records" value={calcResult.record_count} /></Col>
          </Row>
        )}
      </Modal>

      <Modal title="Attendance Policy" visible={policyVisible} onOk={handleSavePolicy} onCancel={() => setPolicyVisible(false)}>
        <Form form={policyForm} layout="vertical">
          <Form.Item name="regular_hours_per_day" label="Regular Hours/Day" initialValue={8}><InputNumber min={1} max={24} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="overtime_multiplier" label="Overtime Multiplier" initialValue={1.5}><InputNumber min={1} max={5} step={0.25} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="weekly_overtime_threshold" label="Weekly Overtime Threshold" initialValue={40}><InputNumber min={20} max={80} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="double_time_after" label="Double Time After (hours)" initialValue={12}><InputNumber min={8} max={24} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default TimeAttendance;
