import React, { useEffect, useState } from 'react';
import { Card, Tabs, Form, Input, Button, Table, message } from 'antd';

const DimensionsManager = () => {
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState('class');
  const [form] = Form.useForm();

  const loadAll = async () => {
    try {
      setLoading(true);
      const [cls, locs, deps] = await Promise.all([
        window.electronAPI.listClasses?.(),
        window.electronAPI.listLocations?.(),
        window.electronAPI.listDepartments?.(),
      ]);
      setClasses(Array.isArray(cls) ? cls : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setDepartments(Array.isArray(deps) ? deps : []);
    } catch (e) {
      message.error('Failed to load dimensions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const onCreate = async (type, values) => {
    try {
      setLoading(true);
      if (type === 'class') await window.electronAPI.createClass(values);
      if (type === 'location') await window.electronAPI.createLocation(values);
      if (type === 'department') await window.electronAPI.createDepartment(values);
      form.resetFields();
      await loadAll();
      message.success('Created successfully');
    } catch (e) {
      message.error('Failed to create');
    } finally {
      setLoading(false);
    }
  };

  const cols = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  return (
    <Card title="Classes, Locations, Departments" style={{ margin: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type={activeKey === 'class' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('class')}>
          Classes
        </Button>
        <Button type={activeKey === 'location' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('location')}>
          Locations
        </Button>
        <Button type={activeKey === 'department' ? 'primary' : 'default'} onClick={() => setActiveKey('department')}>
          Departments
        </Button>
      </div>

      {activeKey === 'class' && (
        <div>
          <Form layout="inline" form={form} onFinish={(v)=>onCreate('class', v)}>
            <Form.Item name="name" rules={[{ required: true }]}>
              <Input placeholder="Class name" />
            </Form.Item>
            <Form.Item name="code">
              <Input placeholder="Code" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>Add</Button>
            </Form.Item>
          </Form>
          <Table columns={cols} dataSource={classes.map(c=>({ ...c, key: c.id }))} loading={loading} />
        </div>
      )}

      {activeKey === 'location' && (
        <div>
          <Form layout="inline" form={form} onFinish={(v)=>onCreate('location', v)}>
            <Form.Item name="name" rules={[{ required: true }]}>
              <Input placeholder="Location name" />
            </Form.Item>
            <Form.Item name="code">
              <Input placeholder="Code" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>Add</Button>
            </Form.Item>
          </Form>
          <Table columns={cols} dataSource={locations.map(c=>({ ...c, key: c.id }))} loading={loading} />
        </div>
      )}

      {activeKey === 'department' && (
        <div>
          <Form layout="inline" form={form} onFinish={(v)=>onCreate('department', v)}>
            <Form.Item name="name" rules={[{ required: true }]}>
              <Input placeholder="Department name" />
            </Form.Item>
            <Form.Item name="code">
              <Input placeholder="Code" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>Add</Button>
            </Form.Item>
          </Form>
          <Table columns={cols} dataSource={departments.map(c=>({ ...c, key: c.id }))} loading={loading} />
        </div>
      )}
    </Card>
  );
};

export default DimensionsManager;


