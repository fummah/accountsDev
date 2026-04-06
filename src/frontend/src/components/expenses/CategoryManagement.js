import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const { Option } = Select;

const COLORS = ['#1890ff','#52c41a','#fa8c16','#f5222d','#722ed1','#eb2f96','#13c2c2','#faad14','#2f54eb','#a0d911','#ff7a45','#597ef7','#8c8c8c','#bfbfbf'];

const CategoryManagement = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.expenseCategoriesList?.();
      setCategories(Array.isArray(data) ? data : []);
    } catch (_) { setCategories([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ color: '#1890ff', status: 'Active' }); setModalOpen(true); };
  const openEdit = (record) => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      let res;
      if (editing) {
        res = await window.electronAPI.expenseCategoryUpdate(editing.id, vals.name, vals.description, vals.color, vals.status);
      } else {
        res = await window.electronAPI.expenseCategoryInsert(vals.name, vals.description, vals.color);
      }
      if (res?.success) {
        message.success(editing ? 'Category updated' : 'Category added');
        setModalOpen(false);
        form.resetFields();
        load();
      } else {
        message.error(res?.error || 'Save failed');
      }
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Save failed'); }
  };

  const handleDelete = async (id) => {
    const res = await window.electronAPI.expenseCategoryDelete(id);
    if (res?.success) { message.success('Category deleted'); load(); }
    else message.error(res?.error || 'Delete failed');
  };

  const columns = [
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60,
      render: c => <div style={{ width: 24, height: 24, borderRadius: 4, background: c || '#1890ff' }} /> },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || '') },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: v => <Tag color={(v || 'Active') === 'Active' ? 'green' : 'red'}>{v || 'Active'}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this category?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Expense Categories</span>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Category</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={categories} loading={loading} rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} categories` }} size="middle" />
      </Card>

      <Modal title={editing ? 'Edit Category' : 'Add Category'} visible={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSave} okText="Save" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Category Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Office Supplies" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="color" label="Color" initialValue="#1890ff">
                <Select>
                  {COLORS.map(c => <Option key={c} value={c}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: c, marginRight: 8, verticalAlign: 'middle' }} />{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              {editing && (
                <Form.Item name="status" label="Status" initialValue="Active">
                  <Select>
                    <Option value="Active">Active</Option>
                    <Option value="Inactive">Inactive</Option>
                  </Select>
                </Form.Item>
              )}
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default CategoryManagement;
