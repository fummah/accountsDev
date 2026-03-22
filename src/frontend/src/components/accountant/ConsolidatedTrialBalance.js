import React, { useEffect, useState } from 'react';
import { Card, Form, DatePicker, Select, Checkbox, Button, Table, message } from 'antd';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ConsolidatedTrialBalance = () => {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const list = await (window.electronAPI.listEntities ? window.electronAPI.listEntities() : []);
        setEntities(Array.isArray(list) ? list : []);
      } catch (e) {
        message.error('Failed to load entities');
      }
    })();
  }, []);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const entityIds = values.entityIds || [];
      const [start, end] = values.range || [];
      const payload = {
        entityIds,
        startDate: start ? start.format('YYYY-MM-DD') : undefined,
        endDate: end ? end.format('YYYY-MM-DD') : undefined,
        eliminateIntercompany: values.eliminateIntercompany !== false,
      };
      const data = await window.electronAPI.getTrialBalanceConsolidated(payload);
      if (!Array.isArray(data)) {
        message.error(data?.error || 'Failed to load consolidated trial balance');
        setRows([]);
        return;
      }
      setRows(data.map((r, idx) => ({
        key: idx,
        accountName: r.accountName,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        balance: Number(r.balance || 0),
      })));
    } catch (e) {
      message.error('Failed to run consolidated trial balance');
      setRows([]);
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
    <Card title="Consolidated Trial Balance" style={{ margin: 24 }}>
      <Form form={form} layout="inline" onFinish={onFinish} style={{ marginBottom: 16 }}>
        <Form.Item name="entityIds" label="Entities">
          <Select mode="multiple" style={{ minWidth: 320 }} placeholder="Select entities">
            {entities.map(e => (
              <Option key={e.id} value={e.id}>{e.name}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="range" label="Date Range">
          <RangePicker />
        </Form.Item>
        <Form.Item name="eliminateIntercompany" valuePropName="checked" initialValue={true}>
          <Checkbox>Eliminate Intercompany</Checkbox>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>Run</Button>
        </Form.Item>
      </Form>

      <Table columns={columns} dataSource={rows} loading={loading} pagination={false} />
    </Card>
  );
};

export default ConsolidatedTrialBalance;


