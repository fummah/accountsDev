import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.listDepartments();
      setDepartments(Array.isArray(res) ? res : []);
    } catch {
      message.error('Failed to load departments');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    try {
      const vals = await form.validateFields();
      const res = await window.electronAPI.createDepartment({ name: vals.name, code: vals.code || '' });
      if (res?.error) { message.error(res.error); return; }
      message.success('Department created');
      setModalVisible(false);
      form.resetFields();
      load();
    } catch (e) { if (!e?.errorFields) message.error('Save failed'); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || '') },
    { title: 'Code', dataIndex: 'code', key: 'code', render: v => v || '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={(v || 'Active') === 'Active' ? 'green' : 'default'}>{v || 'Active'}</Tag> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Departments</span>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalVisible(true); }}>Add Department</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={departments} rowKey="id" loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} departments` }} />
      </Card>

      <Modal title="Add Department" visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleAdd} okText="Save" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Department Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Human Resources" />
          </Form.Item>
          <Form.Item name="code" label="Code (optional)">
            <Input placeholder="e.g. HR" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Departments;
