import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, message, Popconfirm, Modal, Form, DatePicker, Select, Row, Col } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';

const CustomerList = () => {
  const { symbol: cSym } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm] = Form.useForm();

  const load = useCallback(async (page, pageSize, searchTerm) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(page || 1, pageSize || 25, searchTerm || '');
      if (res && Array.isArray(res.data)) {
        setCustomers(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setCustomers(res);
        setPagination(p => ({ ...p, current: 1, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllCustomers?.();
        setCustomers(Array.isArray(all) ? all : []);
        setPagination(p => ({ ...p, current: 1, total: (all || []).length }));
      }
    } catch {
      message.error('Failed to load customers');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(1, pagination.pageSize, search); }, []);

  const handleTableChange = (pag) => {
    load(pag.current, pag.pageSize, search);
  };

  const handleSearch = () => {
    load(1, pagination.pageSize, search);
  };

  const handleAddCustomer = async (values) => {
    try {
      await window.electronAPI.insertCustomer?.(
        '', // title
        values.first_name || values.display_name || '',
        '', // middle_name
        values.last_name || '',
        '', // suffix
        values.email || '',
        values.display_name || `${values.first_name || ''} ${values.last_name || ''}`.trim(),
        values.company_name || values.company || '',
        values.phone_number || values.phone || '',
        values.mobile_number || values.mobile || '',
        '', // fax
        '', // other
        '', // website
        values.address1 || '',
        values.address2 || '',
        values.city || '',
        values.state || '',
        values.postal_code || values.zip || '',
        values.country || '',
        '', // payment_method
        '', // terms
        '', // tax_number
        0, // opening_balance
        null, // as_of
        '', // delivery_option
        'en', // language
        values.notes || ''
      );
      message.success('Customer added');
      setAddModalVisible(false);
      addForm.resetFields();
      load(1, pagination.pageSize, search);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add customer'); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await window.electronAPI.deleteRecord?.(id, 'customers');
      if (res && res.error) {
        message.error(res.error, 6);
        return;
      }
      if (res && res.success === false) {
        message.error(res.error || 'Delete failed — customer may have linked transactions', 6);
        return;
      }
      message.success('Customer deleted');
      load(pagination.current, pagination.pageSize, search);
    } catch {
      message.error('Delete failed');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (text, record) => (
        <Link to={`/main/customers/details/${record.id}`} style={{ fontWeight: 500 }}>{text || '-'}</Link>
      ),
    },
    { title: 'Company', dataIndex: 'company_name', key: 'company', responsive: ['md'], render: v => v || '' },
    { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true, render: v => v || '' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone', responsive: ['lg'], render: v => v || '' },
    {
      title: 'Balance',
      dataIndex: 'opening_balance',
      key: 'balance',
      width: 110,
      sorter: (a, b) => (Number(a.opening_balance) || 0) - (Number(b.opening_balance) || 0),
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_, r) => <Tag color={r.status === 'Active' || !r.status ? 'green' : 'default'}>{r.status || 'Active'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />}
            onClick={() => history.push(`/main/customers/details/${record.id}`)}>Edit</Button>
          <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Customers</span>}
        extra={
          <Space>
            <Input.Search
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 240 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => load(1, pagination.pageSize, search)}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => setAddModalVisible(true)}>
              Add Customer
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100'],
            showTotal: (total) => `${total} customers`,
          }}
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title="Add Customer"
        visible={addModalVisible}
        onOk={() => addForm.submit()}
        onCancel={() => { setAddModalVisible(false); addForm.resetFields(); }}
        okText="Create"
        width={600}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddCustomer} preserve={false}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="display_name" label="Display Name"><Input /></Form.Item>
          <Form.Item name="company_name" label="Company"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="phone_number" label="Phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="mobile_number" label="Mobile"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="address1" label="Street Address"><Input /></Form.Item>
          <Form.Item name="address2" label="Address Line 2"><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="postal_code" label="ZIP"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="country" label="Country"><Input /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerList;
