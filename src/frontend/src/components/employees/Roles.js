import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.listRoles?.();
      setRoles(Array.isArray(res) ? res : []);
    } catch { setRoles([]); }
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (editing) {
        const res = await window.electronAPI.updateRole?.(editing.id, vals.name, vals.description || '');
        if (res?.success) { message.success('Role updated'); }
        else { message.error(res?.error || 'Update failed'); return; }
      } else {
        const res = await window.electronAPI.createRole?.(vals.name, vals.description || '');
        if (res?.success) { message.success('Role created'); }
        else { message.error(res?.error || 'Create failed'); return; }
      }
      setModalVisible(false);
      form.resetFields();
      setEditing(null);
      loadRoles();
    } catch (e) { if (!e?.errorFields) message.error('Save failed'); }
  };

  const handleDelete = async (id) => {
    const res = await window.electronAPI.deleteRole?.(id);
    if (res?.success) { message.success('Role deleted'); loadRoles(); }
    else { message.error(res?.error || 'Delete failed'); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || '') },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '-' },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalVisible(true); }}>Edit</Button>
          <Popconfirm title="Delete this role?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Roles Management"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadRoles}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalVisible(true); }}>Add Role</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={roles} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} size="middle" />
      </Card>

      <Modal
        title={editing ? 'Edit Role' : 'Add Role'}
        visible={modalVisible}
        onCancel={() => { setModalVisible(false); setEditing(null); form.resetFields(); }}
        onOk={handleSave}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Role Name" rules={[{ required: true, message: 'Role name is required' }]}>
            <Input placeholder="e.g. Accountant" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Brief description of the role" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Roles;
