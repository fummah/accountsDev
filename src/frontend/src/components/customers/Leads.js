import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, message } from 'antd';

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.crmListLeads();
      setLeads(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };
  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({ ...record });
    setModalOpen(true);
  };
  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await window.electronAPI.crmUpdateLead({ ...editing, ...values });
      message.success('Lead updated');
    } else {
      await window.electronAPI.crmCreateLead(values);
      message.success('Lead created');
    }
    setModalOpen(false);
    await load();
  };
  const handleDelete = async (record) => {
    await window.electronAPI.crmDeleteLead(record.id);
    message.success('Lead deleted');
    await load();
  };

  const convertToCustomer = async (record) => {
    try {
      // Map lead -> customer fields
      const name = (record.name || '').trim();
      const [firstName, ...rest] = name.split(' ');
      const lastName = rest.join(' ');
      await window.electronAPI.insertCustomer(
        '',
        firstName || record.name || '', // first_name
        '',
        lastName || '',
        '',
        record.email || '',
        record.name || record.company || '', // display_name
        record.company || '',
        record.phone || '', // phone_number
        '', // mobile
        '', // fax
        '', // other
        '', // website
        '', '', '', '', '', '', // address1..country
        '', // payment_method
        '', // terms
        '', // tax_number
        record.owner || 'system', // entered_by
        0, // opening_balance
        '', // as_of
        '', // delivery_option
        '', // language
        record.notes || ''
      );
      message.success('Lead converted to customer');
    } catch (e) {
      message.error(String(e?.message || e));
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Company', dataIndex: 'company', key: 'company' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Owner', dataIndex: 'owner', key: 'owner' },
    {
      title: 'Action', key: 'action', width: 220, render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>Edit</Button>
          <Button size="small" danger onClick={() => handleDelete(r)}>Delete</Button>
          <Button size="small" type="primary" onClick={() => convertToCustomer(r)}>Convert</Button>
        </Space>
      )
    }
  ];

  return (
    <Card title="Leads" extra={<Button type="primary" onClick={openNew}>New Lead</Button>}>
      <Table rowKey="id" columns={columns} dataSource={leads} loading={loading} pagination={false} />

      <Modal title={editing ? 'Edit Lead' : 'New Lead'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave} okText="Save">
        <Form layout="vertical" form={form}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Company" name="company">
            <Input />
          </Form.Item>
          <Form.Item label="Email" name="email">
            <Input type="email" />
          </Form.Item>
          <Form.Item label="Phone" name="phone">
            <Input />
          </Form.Item>
          <Form.Item label="Status" name="status" initialValue="new">
            <Select>
              <Select.Option value="new">New</Select.Option>
              <Select.Option value="contacted">Contacted</Select.Option>
              <Select.Option value="qualified">Qualified</Select.Option>
              <Select.Option value="won">Won</Select.Option>
              <Select.Option value="lost">Lost</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="Source" name="source">
            <Input />
          </Form.Item>
          <Form.Item label="Owner" name="owner">
            <Input />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Leads;


