import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Input, Space, Typography, Popconfirm, message } from 'antd';

const { Title } = Typography;

const emptyPolicy = { id: null, entityType: 'expense', minAmount: 0, requiredLevels: 1, rules: { rolesPerLevel: [['Manager']] } };

const ApprovalPolicies = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const rows = await window.electronAPI.approvalPolicyList();
      setPolicies(rows || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onAdd = () => {
    form.setFieldsValue(emptyPolicy);
    setOpen(true);
  };
  const onEdit = (row) => {
    const next = { ...row, rules: (typeof row.rules === 'string' ? JSON.parse(row.rules) : (row.rules || {})) };
    form.setFieldsValue(next);
    setOpen(true);
  };
  const onDelete = async (row) => {
    await window.electronAPI.approvalPolicyDelete(row.id);
    message.success('Policy deleted');
    load();
  };
  const onSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, rules: values.rules ? JSON.parse(values.rules) : { rolesPerLevel: [['Manager']] } };
    await window.electronAPI.approvalPolicySave(payload);
    setOpen(false);
    message.success('Policy saved');
    load();
  };

  const columns = [
    { title: 'Entity', dataIndex: 'entityType', key: 'entityType' },
    { title: 'Min Amount', dataIndex: 'minAmount', key: 'minAmount' },
    { title: 'Levels', dataIndex: 'requiredLevels', key: 'requiredLevels' },
    { title: 'Rules (JSON)', dataIndex: 'rules', key: 'rules', render: (v) => <code style={{fontSize:12}}>{typeof v === 'string' ? v : JSON.stringify(v)}</code> },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onEdit(row)}>Edit</Button>
          <Popconfirm title="Delete policy?" onConfirm={() => onDelete(row)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>Approval Policies</Title>
        <Button type="primary" onClick={onAdd}>New Policy</Button>
        <Table rowKey="id" columns={columns} dataSource={policies} loading={loading} />
      </Space>

      <Modal
        title="Approval Policy"
        open={open}
        onOk={onSave}
        onCancel={() => setOpen(false)}
        okText="Save"
      >
        <Form form={form} layout="vertical" initialValues={emptyPolicy}>
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="entityType" label="Entity Type" rules={[{ required: true }]}>
            <Input placeholder="e.g. expense, invoice" />
          </Form.Item>
          <Form.Item name="minAmount" label="Minimum Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={10} />
          </Form.Item>
          <Form.Item name="requiredLevels" label="Required Levels" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} max={5} />
          </Form.Item>
          <Form.Item name="rules" label="Rules JSON" tooltip="Optional JSON e.g. { &quot;rolesPerLevel&quot;: [[&quot;Manager&quot;],[&quot;Admin&quot;]] }">
            <Input.TextArea rows={4} placeholder='{"rolesPerLevel":[["Manager"],["Admin"]]}' />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ApprovalPolicies;


