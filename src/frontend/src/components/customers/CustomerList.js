import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, message, Popconfirm, Modal, Form, Row, Col, Avatar, Typography, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EditOutlined, ImportOutlined, EyeOutlined, TeamOutlined, FileTextOutlined, FileDoneOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import { formatPhone } from '../../utils/phone';
import CustomerContactFields from './shared/CustomerContactFields';
import { resolveTaxRateFields } from '../../utils/taxRate';
import { MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from '../shared/FormSection';
import CsvImportModal from '../common/CsvImportModal';

const { Title, Text } = Typography;

const CustomerList = () => {
  const { symbol: cSym } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [vatRates, setVatRates] = useState([]);
  const [addForm] = Form.useForm();

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

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
    setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
    load(pag.current, pag.pageSize, search);
  };

  const handleSearch = () => {
    load(1, pagination.pageSize, search);
  };

  const handleAddCustomer = async (values) => {
    try {
      const tax = resolveTaxRateFields(values, vatRates);
      await window.electronAPI.insertCustomer?.(
        '', // title
        values.first_name || values.display_name || '',
        '', // middle_name
        values.last_name || '',
        '', // suffix
        values.email || '',
        values.display_name || `${values.first_name || ''} ${values.last_name || ''}`.trim() || values.company_name || values.company || '',
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
        '', // entered_by
        0, // opening_balance
        null, // as_of
        '', // delivery_option
        'en', // language
        values.notes || '',
        values.taxable != null ? values.taxable : true,
        tax.default_tax_rate,
        tax.default_tax_rate_id
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

  const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };
  const iconTile = (grad, Icon) => (
    <div style={{ width: 44, height: 44, borderRadius: 10, background: grad, color: '#fff', fontSize: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon /></div>
  );

  const columns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (text, record) => {
        const nm = text || `${record.first_name || ''} ${record.last_name || ''}`.trim() || '-';
        const initials = nm.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return (
          <Space size={10}>
            <Avatar size={34} style={{ background: 'linear-gradient(135deg,#1890ff,#69c0ff)', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{initials || 'C'}</Avatar>
            <div>
              <Link to={`/main/customers/details/${record.id}`} style={{ fontWeight: 600, color: '#1890ff' }}>{nm}</Link>
              {record.company_name && <div><Text type="secondary" style={{ fontSize: 12 }}>{record.company_name}</Text></div>}
            </div>
          </Space>
        );
      },
    },
    { title: 'Email', dataIndex: 'email', key: 'email', render: v => v ? <a href={`mailto:${v}`}>{v}</a> : '-' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone', responsive: ['lg'], render: v => formatPhone(v) || '-' },
    {
      title: 'Due Balance',
      dataIndex: 'balance',
      key: 'balance',
      sorter: (a, b) => (Number(a.balance) || 0) - (Number(b.balance) || 0),
      render: v => {
        const bal = Number(v || 0);
        return <span style={{ fontWeight: 600, color: bal > 0 ? '#fa8c16' : '#52c41a' }}>{cSym} {bal.toFixed(2)}</span>;
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_, r) => <Tag color={r.status === 'Active' || !r.status ? 'green' : 'red'} style={{ borderRadius: 20, paddingInline: 10 }}>{r.status || 'Active'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => history.push(`/main/customers/details/${record.id}`)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => history.push(`/main/customers/details/${record.id}`)} /></Tooltip>
          <Tooltip title="New Invoice"><Button type="text" size="small" icon={<FileTextOutlined />} style={{ color: '#1890ff' }} onClick={() => history.push(`/main/customers/invoices/new?customer=${record.id}`)} /></Tooltip>
          <Tooltip title="New Quote"><Button type="text" size="small" icon={<FileDoneOutlined />} style={{ color: '#722ed1' }} onClick={() => history.push(`/main/customers/quotes/new?customer=${record.id}`)} /></Tooltip>
          <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />Customers</Title>
          <Text type="secondary">Manage your customers, contacts and receivables</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load(1, pagination.pageSize, search)}>Refresh</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportVisible(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)', fontWeight: 600 }}>Add Customer</Button>
        </Space>
      </div>

      {/* Stat tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {iconTile('linear-gradient(135deg,#1890ff,#69c0ff)', TeamOutlined)}
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Customers</Text><Text strong style={{ fontSize: 18 }}>{pagination.total}</Text></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table card */}
      <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="Search customers, email, company..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 300, marginRight: 'auto' }}
            allowClear
          />
        </div>
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          scroll={{ x: 'max-content' }}
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
        okText="Create Customer"
        width={MODAL_WIDTH}
        bodyStyle={MODAL_BODY_SCROLL_STYLE}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddCustomer} preserve={false}>
          <CustomerContactFields
            form={addForm}
            vatRates={vatRates}
            notesAsInput
            countryPlaceholder="Select a country"
          />
        </Form>
      </Modal>

      <CsvImportModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        title="Import Customers"
        description="Paste a QuickBooks customer CSV export. Recognizes 'Customer', 'Company', 'Main Phone', 'Main Email', 'Bill to 1..5', 'First/M.I./Last Name', 'Alt. Phone', 'Active Status' and 'Balance / Balance Total' columns."
        importFn={(csv, opts) => window.electronAPI.importCustomersCsv(csv, opts)}
        onImported={() => load(1, pagination.pageSize, search)}
      />
    </div>
  );
};

export default CustomerList;
