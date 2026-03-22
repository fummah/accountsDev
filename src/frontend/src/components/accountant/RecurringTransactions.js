import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const RecurringTransactions = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getRecurringTransactions();
      if (Array.isArray(res)) setData(res);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ frequency: 'monthly', status: 'active', kind: 'generic' });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      description: record.description,
      amount: record.amount,
      frequency: record.frequency,
      nextDate: record.nextDate,
      kind: record.kind || 'generic',
      status: record.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await window.electronAPI.updateRecurringTransaction({ ...values, id: editing.id });
        message.success('Updated');
      } else {
        await window.electronAPI.createRecurringTransaction(values);
        message.success('Created');
      }
      setModalOpen(false);
      load();
    } catch {}
  };

  const handleDelete = async (id) => {
    await window.electronAPI.deleteRecurringTransaction(id);
    message.success('Deleted');
    load();
  };

  const handlePause = async (id) => {
    await window.electronAPI.recurringPause(id);
    message.info('Paused');
    load();
  };

  const handleResume = async (id) => {
    await window.electronAPI.recurringResume(id);
    message.success('Resumed');
    load();
  };

  const handleRunNow = async (id) => {
    try {
      await window.electronAPI.recurringRunNow(id);
      message.success('Executed successfully');
      load();
    } catch (e) {
      message.error(e?.message || 'Execution failed');
    }
  };

  const bulkPause = async () => {
    await window.electronAPI.recurringBulkPause(selectedRowKeys);
    message.info(`${selectedRowKeys.length} paused`);
    setSelectedRowKeys([]);
    load();
  };

  const bulkResume = async () => {
    await window.electronAPI.recurringBulkResume(selectedRowKeys);
    message.success(`${selectedRowKeys.length} resumed`);
    setSelectedRowKeys([]);
    load();
  };

  const statusColor = { active: 'green', paused: 'orange', completed: 'blue' };
  const freqLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

  const columns = [
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 100, render: v => v != null ? Number(v).toFixed(2) : '-' },
    { title: 'Frequency', dataIndex: 'frequency', key: 'frequency', width: 100, render: v => freqLabel[v] || v },
    { title: 'Kind', dataIndex: 'kind', key: 'kind', width: 90, render: v => <Tag>{v || 'generic'}</Tag> },
    { title: 'Next Date', dataIndex: 'nextDate', key: 'nextDate', width: 110, sorter: (a, b) => (a.nextDate || '').localeCompare(b.nextDate || '') },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: v => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 200, render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleRunNow(r.id)} title="Run Now" />
          {r.status === 'active' ? (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => handlePause(r.id)} title="Pause" />
          ) : (
            <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => handleResume(r.id)} title="Resume" />
          )}
          <Button size="small" onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete this recurring transaction?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Recurring Transactions"
        size="small"
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Button size="small" onClick={bulkPause}>Pause Selected ({selectedRowKeys.length})</Button>
                <Button size="small" onClick={bulkResume}>Resume Selected</Button>
              </>
            )}
            <Button size="small" icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>New Recurring</Button>
          </Space>
        }
      >
        <p style={{ color: '#666', margin: '0 0 12px' }}>
          Automate invoices, bills, journal entries, and payroll on a recurring schedule.
          The scheduler processes due items automatically.
        </p>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 15 }}
          rowSelection={rowSelection}
        />
      </Card>

      <Modal
        title={editing ? 'Edit Recurring Transaction' : 'New Recurring Transaction'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={editing ? 'Update' : 'Create'}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input placeholder="e.g. Monthly office rent" />
          </Form.Item>
          <Form.Item name="amount" label="Amount">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="kind" label="Type">
            <Select>
              <Select.Option value="generic">Generic</Select.Option>
              <Select.Option value="invoice">Invoice</Select.Option>
              <Select.Option value="bill">Bill / Expense</Select.Option>
              <Select.Option value="journal">Journal Entry</Select.Option>
              <Select.Option value="payroll">Payroll</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="frequency" label="Frequency" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="daily">Daily</Select.Option>
              <Select.Option value="weekly">Weekly</Select.Option>
              <Select.Option value="monthly">Monthly</Select.Option>
              <Select.Option value="quarterly">Quarterly</Select.Option>
              <Select.Option value="yearly">Yearly</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="nextDate" label="Next Date" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="paused">Paused</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RecurringTransactions;
