import React, { useEffect, useState } from 'react';
import { Card, Form, Select, DatePicker, Button, Checkbox, Table, message } from 'antd';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TrialBalanceAdvanced = () => {
  const [entities, setEntities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const [ents, cls, locs, deps] = await Promise.all([
          window.electronAPI.listEntities?.(),
          window.electronAPI.listClasses?.(),
          window.electronAPI.listLocations?.(),
          window.electronAPI.listDepartments?.(),
        ]);
        setEntities(Array.isArray(ents) ? ents : []);
        setClasses(Array.isArray(cls) ? cls : []);
        setLocations(Array.isArray(locs) ? locs : []);
        setDepartments(Array.isArray(deps) ? deps : []);
      } catch {
        message.error('Failed to load filters');
      }
    })();
  }, []);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const [start, end] = values.range || [];
      const filters = {
        entityIds: values.entityIds || [],
        classTag: values.class || undefined,
        location: values.location || undefined,
        department: values.department || undefined,
        startDate: start ? start.format('YYYY-MM-DD') : undefined,
        endDate: end ? end.format('YYYY-MM-DD') : undefined,
      };
      const data = await window.electronAPI.getTrialBalanceAdvanced(filters);
      if (!Array.isArray(data)) {
        message.error(data?.error || 'Failed to load trial balance');
        setRows([]);
        return;
      }
      setRows(data.map((r, i) => ({
        key: i,
        accountName: r.accountName,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        balance: Number(r.balance || 0),
      })));
    } catch {
      message.error('Failed to run advanced trial balance');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Account', dataIndex: 'accountName', key: 'accountName' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', render: v => v ? v.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '' },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', render: v => v ? v.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '' },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', render: v => v ? v.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '' },
  ];

  return (
    <Card title="Advanced Trial Balance" style={{ margin: 24 }}>
      <Form layout="inline" form={form} onFinish={onFinish} style={{ marginBottom: 16 }}>
        <Form.Item name="entityIds" label="Entities">
          <Select mode="multiple" style={{ minWidth: 280 }} placeholder="Select entities">
            {entities.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="class" label="Class">
          <Select allowClear style={{ minWidth: 160 }} placeholder="Class">
            {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="location" label="Location">
          <Select allowClear style={{ minWidth: 160 }} placeholder="Location">
            {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="department" label="Department">
          <Select allowClear style={{ minWidth: 160 }} placeholder="Department">
            {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="range" label="Dates">
          <RangePicker />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>Run</Button>
        </Form.Item>
      </Form>

      <Table columns={columns} dataSource={rows} pagination={false} loading={loading} />
    </Card>
  );
};

export default TrialBalanceAdvanced;


