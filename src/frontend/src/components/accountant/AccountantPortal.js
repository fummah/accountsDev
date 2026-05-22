import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Space, Row, Col, Statistic, Tabs, Badge, Descriptions } from 'antd';
import { TeamOutlined, PlusOutlined, EyeOutlined, SwapOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

const AccountantPortal = () => {
  const [entities, setEntities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [e, u] = await Promise.all([
        window.electronAPI.listEntities?.() || [],
        window.electronAPI.getAllUsers?.() || [],
      ]);
      setEntities(Array.isArray(e) ? e : []);
      setUsers(Array.isArray(u) ? u : (u?.all || []));
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.createEntity?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Client entity created');
      setAddVisible(false);
      form.resetFields();
      loadData();
    } catch {}
  };

  const handleAssign = async () => {
    try {
      const vals = await assignForm.validateFields();
      await window.electronAPI.assignUserToEntity?.(vals.userId, vals.entityId, vals.role);
      message.success('User assigned to entity');
      setAssignVisible(false);
      assignForm.resetFields();
    } catch (err) { message.error(err.message); }
  };

  const switchToEntity = async (entityId) => {
    try {
      await window.electronAPI.settingsSet?.('active_entity', entityId);
      message.success('Switched to entity. Refresh to see changes.');
    } catch (err) { message.error(err.message); }
  };

  const entityColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Client Name', dataIndex: 'name', key: 'name' },
    { title: 'Code', dataIndex: 'code', key: 'code', render: v => <Tag>{v}</Tag> },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'active' ? 'green' : 'orange'}>{v || 'active'}</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<SwapOutlined />} onClick={() => switchToEntity(r.id)}>Switch To</Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedEntity(r)}>Details</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><TeamOutlined /> Accountant Partner Portal — Multi-Client Access</>}
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => { assignForm.resetFields(); setAssignVisible(true); }}>Assign User</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddVisible(true)}>Add Client</Button>
        </Space>
      }>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Statistic title="Total Clients" value={entities.length} prefix={<DatabaseOutlined />} /></Col>
        <Col span={6}><Statistic title="Active" value={entities.filter(e => !e.status || e.status === 'active').length} valueStyle={{ color: '#3f8600' }} /></Col>
        <Col span={6}><Statistic title="Users" value={users.length} /></Col>
      </Row>

      <Table columns={entityColumns} dataSource={entities} rowKey="id" loading={loading} size="small" />

      <Modal title="Add Client Entity" visible={addVisible} onOk={handleCreate} onCancel={() => setAddVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Client/Company Name" rules={[{ required: true }]}><Input placeholder="e.g. ABC Corp" /></Form.Item>
          <Form.Item name="code" label="Entity Code"><Input placeholder="e.g. ABC" /></Form.Item>
          <Form.Item name="type" label="Entity Type" initialValue="client">
            <Select>
              <Option value="client">Client</Option>
              <Option value="subsidiary">Subsidiary</Option>
              <Option value="branch">Branch</Option>
              <Option value="franchise">Franchise</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Assign User to Entity" visible={assignVisible} onOk={handleAssign} onCancel={() => setAssignVisible(false)}>
        <Form form={assignForm} layout="vertical">
          <Form.Item name="userId" label="User" rules={[{ required: true }]}>
            <Select placeholder="Select user" showSearch filterOption={(i, o) => (o?.children || '').toString().toLowerCase().includes(i.toLowerCase())}>
              {users.map(u => <Option key={u.id} value={u.id}>{u.display_name || u.email || u.name || `User #${u.id}`}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="entityId" label="Client Entity" rules={[{ required: true }]}>
            <Select placeholder="Select entity">
              {entities.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="role" label="Access Level" initialValue="accountant">
            <Select>
              <Option value="accountant">Accountant (Full Access)</Option>
              <Option value="bookkeeper">Bookkeeper (Limited)</Option>
              <Option value="viewer">Viewer (Read Only)</Option>
              <Option value="admin">Admin</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Client Details" visible={!!selectedEntity} onCancel={() => setSelectedEntity(null)} footer={null}>
        {selectedEntity && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Name">{selectedEntity.name}</Descriptions.Item>
            <Descriptions.Item label="Code">{selectedEntity.code}</Descriptions.Item>
            <Descriptions.Item label="Type">{selectedEntity.type}</Descriptions.Item>
            <Descriptions.Item label="ID">{selectedEntity.id}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default AccountantPortal;
