import React, { useEffect, useState } from 'react';
import { Card, Table, Form, Input, Button, Space, message } from 'antd';

const Warehouses = () => {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ id: null, code: '', name: '', location: '' });
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const list = await window.electronAPI.getWarehouses();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    try {
      if (!form.name) { setError('Name is required'); return; }
      if (form.id) {
        await window.electronAPI.updateWarehouse({ ...form });
        message.success('Warehouse updated');
      } else {
        await window.electronAPI.createWarehouse({ code: form.code || null, name: form.name, location: form.location || null });
        message.success('Warehouse created');
      }
      setForm({ id: null, code: '', name: '', location: '' });
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const remove = async (id) => {
    await window.electronAPI.deleteWarehouse(id);
    message.success('Warehouse deleted');
    await load();
  };

  const edit = (w) => {
    setForm({ id: w.id, code: w.code || '', name: w.name || '', location: w.location || '' });
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Location', dataIndex: 'location', key: 'location' },
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Space>
          <Button onClick={() => edit(r)} size="small">Edit</Button>
          <Button danger onClick={() => remove(r.id)} size="small">Delete</Button>
        </Space>
      )
    }
  ];

  return (
    <Card title="Warehouses">
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <Form layout="inline" style={{ marginBottom: 12 }}>
        <Form.Item>
          <Input placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
        </Form.Item>
        <Form.Item required>
          <Input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Form.Item>
        <Form.Item>
          <Input placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={save}>{form.id ? 'Update' : 'Create'}</Button>
            {form.id && <Button onClick={() => setForm({ id: null, code: '', name: '', location: '' })}>Cancel</Button>}
          </Space>
        </Form.Item>
      </Form>
      <Table rowKey="id" columns={columns} dataSource={rows} pagination={false} />
    </Card>
  );
};

export default Warehouses;


