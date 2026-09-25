import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Card, Space, Tag, message, Popconfirm, Modal, Form, Row, Col, Avatar, Typography, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined, TeamOutlined, FileTextOutlined, FileDoneOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import { formatPhone } from '../../utils/phone';
import CustomerContactFields from './shared/CustomerContactFields';
import { resolveTaxRateFields, describeTaxRate } from '../../utils/taxRate';
import { MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from '../shared/FormSection';
import ListToolbar from '../shared/ListToolbar';
import { toCsv, downloadCsv, csvDate } from '../../utils/csv';

const { Title, Text } = Typography;

// Human-readable export columns. No internal/secret fields (no password hashes,
// tokens, etc.); "Customer Number" is the user-facing customer number (the id
// the app shows and searches by).
const EXPORT_HEADERS = [
  'Customer Number', 'Display Name', 'First Name', 'Last Name', 'Company',
  'Email', 'Phone', 'Mobile', 'Website',
  'Street Address', 'Address Line 2', 'City', 'State', 'Postal Code', 'Country',
  'Tax Status', 'Default Tax Rate', 'Status', 'Outstanding Balance', 'Created Date', 'Notes',
];

const CustomerList = () => {
  const { symbol: cSym } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [vatRates, setVatRates] = useState([]);
  const [addForm] = Form.useForm();

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

  // '' means "All Statuses" to the backend filter.
  const statusParam = statusFilter && statusFilter !== 'all' ? statusFilter : '';

  const load = useCallback(async (page, pageSize, searchTerm, status) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(page || 1, pageSize || 25, searchTerm || '', status || '');
      if (res && Array.isArray(res.data)) {
        setCustomers(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setCustomers(res);
        setPagination(p => ({ ...p, current: 1, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllCustomers?.();
        const list = Array.isArray(all) ? all : (all?.all || []);
        setCustomers(list);
        setPagination(p => ({ ...p, current: 1, total: list.length }));
      }
    } catch {
      message.error('Failed to load customers');
    }
    setLoading(false);
  }, []);

  // Reload when the status filter changes.
  useEffect(() => { load(1, pagination.pageSize, search, statusParam); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableChange = (pag) => {
    setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
    load(pag.current, pag.pageSize, search, statusParam);
  };

  const handleSearch = () => load(1, pagination.pageSize, search, statusParam);

  const handleRefresh = () => load(pagination.current, pagination.pageSize, search, statusParam);

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
      load(1, pagination.pageSize, search, statusParam);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add customer'); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await window.electronAPI.deleteRecord?.(id, 'customers');
      if (res && res.error) { message.error(res.error, 6); return; }
      if (res && res.success === false) {
        message.error(res.error || 'Delete failed — customer may have linked transactions', 6);
        return;
      }
      message.success('Customer deleted');
      load(pagination.current, pagination.pageSize, search, statusParam);
    } catch {
      message.error('Delete failed');
    }
  };

  // Export EVERY customer matching the current search + status filter (not just
  // the visible page). The backend query is unpaged and uses the SAME filter
  // logic as the list.
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await window.electronAPI.getCustomersForExport?.(search || '', statusParam);
      if (res && res.error) throw new Error(res.error);
      const rows = Array.isArray(res) ? res : (res?.data || []);
      if (!rows.length) {
        message.info('No customers match the current filters.');
        return;
      }
      const csv = toCsv(EXPORT_HEADERS, rows.map(c => ([
        c.id != null ? c.id : '',
        c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || '',
        c.first_name || '', c.last_name || '', c.company_name || '',
        c.email || '', c.phone_number || '', c.mobile_number || '', c.website || '',
        c.address1 || '', c.address2 || '', c.city || '', c.state || '', c.postal_code || '', c.country || '',
        (c.taxable === 0 || c.taxable === false || String(c.taxable) === '0') ? 'Non-Taxable' : 'Taxable',
        describeTaxRate(c, vatRates),
        c.status || 'Active',
        Number(c.balance || 0).toFixed(2),
        csvDate(c.date_entered),
        c.notes || '',
      ])));
      const suffix = statusFilter && statusFilter !== 'all' ? `_${statusFilter}` : '';
      downloadCsv(`Customers${suffix}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
      message.success(`Customer export completed (${rows.length} customers).`);
    } catch (e) {
      console.error('[customers] export failed:', e);
      message.error('Customer export could not be completed. Please try again.');
    } finally {
      setExporting(false);
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
        <ListToolbar
          searchPlaceholder="Search by name, company, email, phone..."
          searchValue={search}
          onSearchChange={setSearch}
          onSearch={handleSearch}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
          onExport={handleExport}
          exportLoading={exporting}
          onRefresh={handleRefresh}
          refreshLoading={loading}
          primaryAction={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}
              style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)', fontWeight: 600 }}>Add Customer</Button>
          }
        />
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
    </div>
  );
};

export default CustomerList;
