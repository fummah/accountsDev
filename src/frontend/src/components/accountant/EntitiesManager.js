import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Form, Input, Select, message, Row, Col } from 'antd';

const { Option } = Select;

const EntitiesManager = () => {
  const [form] = Form.useForm();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadEntities = async () => {
    try {
      setLoading(true);
      const list = await (window.electronAPI.listEntities ? window.electronAPI.listEntities() : []);
      setEntities(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error('Failed to load entities');
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEntities(); }, []);
  useEffect(() => {
    // Attempt to set a default auth context if not already set
    (async () => {
      try {
        if (window.electronAPI.setAuthContext) {
          const me = await window.electronAPI.getMe?.().catch(() => ({ id: 1 }));
          await window.electronAPI.setAuthContext({ userId: me?.id || 1, role: 'Admin' });
        }
      } catch {}
    })();
  }, []);

  const entitiesById = useMemo(() => {
    const map = new Map();
    (entities || []).forEach(e => map.set(e.id, e));
    return map;
  }, [entities]);

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const payload = {
        name: values.name,
        code: values.code || null,
        type: values.type || null,
        parent_id: values.parent_id || null
      };
      const res = await window.electronAPI.createEntity(payload);
      if (res && res.id) {
        // Auto-assign current user as Admin for convenience
        try {
          const me = await window.electronAPI.getMe().catch(() => ({ id: 1 }));
          await window.electronAPI.assignUserToEntity(me?.id || 1, res.id, 'Admin');
        } catch {}
        message.success('Entity created');
        form.resetFields();
        await loadEntities();
      } else {
        message.error(res?.error || 'Failed to create entity');
      }
    } catch (e) {
      message.error(e?.message || 'Failed to create entity');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignMe = async (entityId) => {
    try {
      const me = await window.electronAPI.getMe().catch(() => ({ id: 1 }));
      const res = await window.electronAPI.assignUserToEntity(me?.id || 1, entityId, 'Admin');
      if (res && (res.created || res.updated)) {
        message.success('Assigned to entity');
      } else {
        message.success('Already assigned');
      }
    } catch (e) {
      message.error('Failed to assign');
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Parent', dataIndex: 'parent_id', key: 'parent_id', render: v => (v ? (entitiesById.get(v)?.name || v) : '') },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Actions', key: 'actions', render: (_, row) => (
        <Button onClick={() => handleAssignMe(row.id)}>Assign me</Button>
      )
    }
  ];

  return (
    <Card title="Entities" style={{ margin: 24 }}>
      <Row gutter={16}>
        <Col xs={24} md={10}>
          <Card title="Create Entity" size="small">
            <Form layout="vertical" form={form} onFinish={handleCreate}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please enter name' }]}>
                <Input placeholder="e.g., Parent Co" />
              </Form.Item>
              <Form.Item name="code" label="Code">
                <Input placeholder="e.g., PAR" />
              </Form.Item>
              <Form.Item name="type" label="Type">
                <Select allowClear placeholder="Company / Branch / Department">
                  <Option value="Company">Company</Option>
                  <Option value="Branch">Branch</Option>
                  <Option value="Department">Department</Option>
                </Select>
              </Form.Item>
              <Form.Item name="parent_id" label="Parent">
                <Select allowClear placeholder="Select parent entity">
                  {entities.map(e => (
                    <Option key={e.id} value={e.id}>{e.name}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>Create</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title="Entity List" size="small">
            <Table
              columns={columns}
              dataSource={(entities || []).map(e => ({ ...e, key: e.id }))}
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default EntitiesManager;


