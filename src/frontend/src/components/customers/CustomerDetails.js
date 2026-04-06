import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tabs, Button, Space, Tag, Statistic, Row, Col, message, Form, Input, Modal, Spin, Select, Empty, List, Avatar, Divider } from 'antd';
import { ArrowLeftOutlined, EditOutlined, FileTextOutlined, DollarOutlined, PlusOutlined, LeftOutlined, RightOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useParams, useHistory, Link } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { TabPane } = Tabs;
const statusColors = { Draft: 'default', Sent: 'processing', Pending: 'warning', Unpaid: 'warning', Paid: 'success', 'Partially Paid': 'orange', Overdue: 'error', Cancelled: 'default', Open: 'blue', Accepted: 'success', Declined: 'error', Expired: 'default', Invoiced: 'purple' };

const CustomerDetails = () => {
  const { symbol: cSym } = useCurrency();
  const { id } = useParams();
  const history = useHistory();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [c, allCust, allInvRaw, allQRaw] = await Promise.all([
        window.electronAPI.getSingleCustomer?.(id),
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllInvoices?.(),
        window.electronAPI.getAllQuotes?.(),
      ]);
      if (c) setCustomer(c);
      const custArr = Array.isArray(allCust) ? allCust : (allCust?.all || []);
      setAllCustomers(custArr);
      const invArr = Array.isArray(allInvRaw) ? allInvRaw : (allInvRaw?.all || []);
      setInvoices(invArr.filter(inv => String(inv.customer) === String(id) || String(inv.customer_id) === String(id)));
      const qArr = Array.isArray(allQRaw) ? allQRaw : allQRaw || [];
      setQuotes(qArr.filter(q => String(q.customer) === String(id) || String(q.customer_id) === String(id)));
    } catch {
      message.error('Failed to load customer');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Navigation between customers
  const currentIdx = allCustomers.findIndex(c => String(c.id) === String(id));
  const prevCustomer = currentIdx > 0 ? allCustomers[currentIdx - 1] : null;
  const nextCustomer = currentIdx >= 0 && currentIdx < allCustomers.length - 1 ? allCustomers[currentIdx + 1] : null;

  const openEdit = () => {
    if (!customer) return;
    form.setFieldsValue({
      display_name: customer.display_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      company: customer.company || customer.company_name,
      email: customer.email,
      phone_number: customer.phone_number,
      billing_address: customer.billing_address || customer.address1,
      notes: customer.notes,
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const vals = await form.validateFields();
      await window.electronAPI.updateCustomer?.({ id: Number(id), ...vals });
      message.success('Customer updated');
      setEditOpen(false);
      load();
    } catch {}
  };

  const custName = customer?.display_name || customer?.name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Customer';
  const totalReceivables = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled' && i.status !== 'Draft').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const overdue = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled' && i.status !== 'Draft' && i.last_date && moment(i.last_date).isBefore(moment()));
  const recentInvoices = [...invoices].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);
  const recentQuotes = [...quotes].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);

  const invoiceColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 110,
      render: (t, r) => <Link to={`/main/customers/invoices/edit/${r.id}`}>{t || `#${r.id}`}</Link> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Due', dataIndex: 'last_date', key: 'due', width: 100,
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const quoteColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 110,
      render: (t, r) => <Link to={`/main/customers/quotes/edit/${r.id}`}>{t || `#${r.id}`}</Link> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry', width: 100,
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  if (!customer && !loading) return <div style={{ padding: 24 }}>Customer not found. <Button onClick={() => history.goBack()}>Go Back</Button></div>;

  return (
    <Spin spinning={loading}>
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/main/customers/center')}>Back</Button>
          {prevCustomer && <Button icon={<LeftOutlined />} onClick={() => history.push(`/main/customers/details/${prevCustomer.id}`)}>Prev</Button>}
          {nextCustomer && <Button onClick={() => history.push(`/main/customers/details/${nextCustomer.id}`)}>Next <RightOutlined /></Button>}
        </Space>
        <Space wrap>
          <Button type="primary" icon={<EditOutlined />} onClick={openEdit}>Edit Customer</Button>
          <Button icon={<FileTextOutlined />} onClick={() => history.push(`/main/customers/invoices/new?customer=${id}`)}>New Invoice</Button>
          <Button icon={<FileDoneOutlined />} onClick={() => history.push(`/main/customers/quotes/new?customer=${id}`)}>New Quote</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <h2 style={{ margin: 0 }}>{custName}</h2>
            <span style={{ color: '#888' }}>{customer?.email || ''} {customer?.phone_number ? `• ${customer.phone_number}` : ''}</span>
          </Col>
          <Col><Statistic title="Receivables" value={totalReceivables.toFixed(2)} prefix={cSym} valueStyle={{ fontSize: 18 }} /></Col>
          <Col><Statistic title="Paid" value={totalPaid.toFixed(2)} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Col>
          <Col><Statistic title="Overdue" value={overdue.length} valueStyle={{ fontSize: 18, color: overdue.length > 0 ? '#f5222d' : '#52c41a' }} /></Col>
        </Row>
      </Card>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
          {[
            { key: 'details', label: 'Customer Details' },
            { key: 'invoices', label: 'Invoices (' + invoices.length + ')' },
            { key: 'quotes', label: 'Quotes (' + quotes.length + ')' },
            { key: 'transactions', label: 'Transaction List' },
            { key: 'statements', label: 'Statements' },
          ].map(function(t) {
            return (
              <div key={t.key}
                onClick={function() { setActiveTab(t.key); }}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: activeTab === t.key ? '2px solid #1890ff' : '2px solid transparent',
                  color: activeTab === t.key ? '#1890ff' : 'rgba(0,0,0,0.65)',
                  fontWeight: activeTab === t.key ? 500 : 400,
                  marginBottom: '-1px',
                  transition: 'all 0.3s',
                  userSelect: 'none',
                }}
              >
                {t.label}
              </div>
            );
          })}
        </div>

        {activeTab === 'details' && (
          <>
            <Card loading={loading} style={{ marginBottom: 16 }}>
              <Descriptions column={{ xs: 1, sm: 2, md: 2 }} bordered size="small">
                <Descriptions.Item label="Display Name">{custName}</Descriptions.Item>
                <Descriptions.Item label="Company">{customer?.company || customer?.company_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="Email">{customer?.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{customer?.phone_number || customer?.mobile_number || '-'}</Descriptions.Item>
                <Descriptions.Item label="Balance">{cSym} {Number(customer?.opening_balance || 0).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{customer?.terms || customer?.payment_method || '-'}</Descriptions.Item>
                <Descriptions.Item label="Billing Address" span={2}>{customer?.billing_address || customer?.address1 || '-'}</Descriptions.Item>
                <Descriptions.Item label="Notes" span={2}>{customer?.notes || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
            <Row gutter={16}>
              <Col span={12}>
                <Card title={<><FileTextOutlined /> Recent Invoices</>} size="small"
                  extra={<Button type="link" size="small" onClick={function() { setActiveTab('invoices'); }}>View All</Button>}>
                  {recentInvoices.length === 0 ? <Empty description="No invoices" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
                    <List size="small" dataSource={recentInvoices} renderItem={function(inv) { return (
                      <List.Item extra={<Tag color={statusColors[inv.status] || 'default'}>{inv.status}</Tag>}>
                        <List.Item.Meta
                          title={<Link to={'/main/customers/invoices/edit/' + inv.id}>{inv.number || '#' + inv.id}</Link>}
                          description={'R ' + Number(inv.amount || 0).toFixed(2) + ' — ' + (inv.start_date ? moment(inv.start_date).format('DD/MM/YYYY') : '')} />
                      </List.Item>
                    ); }} />}
                </Card>
              </Col>
              <Col span={12}>
                <Card title={<><FileDoneOutlined /> Recent Quotes</>} size="small"
                  extra={<Button type="link" size="small" onClick={function() { setActiveTab('quotes'); }}>View All</Button>}>
                  {recentQuotes.length === 0 ? <Empty description="No quotes" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
                    <List size="small" dataSource={recentQuotes} renderItem={function(q) { return (
                      <List.Item extra={<Tag color={statusColors[q.status] || 'default'}>{q.status}</Tag>}>
                        <List.Item.Meta
                          title={<Link to={'/main/customers/quotes/edit/' + q.id}>{q.number || '#' + q.id}</Link>}
                          description={'R ' + Number(q.amount || 0).toFixed(2) + ' — ' + (q.start_date ? moment(q.start_date).format('DD/MM/YYYY') : '')} />
                      </List.Item>
                    ); }} />}
                </Card>
              </Col>
            </Row>
          </>
        )}

        {activeTab === 'invoices' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={function() { history.push('/main/customers/invoices/new?customer=' + id); }}>New Invoice</Button>
            </div>
            <Table dataSource={invoices} columns={invoiceColumns} rowKey="id" size="small"
              pagination={{ pageSize: 15, showTotal: function(t) { return t + ' invoices'; } }} />
          </>
        )}

        {activeTab === 'quotes' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={function() { history.push('/main/customers/quotes/new?customer=' + id); }}>New Quote</Button>
            </div>
            <Table dataSource={quotes} columns={quoteColumns} rowKey="id" size="small"
              pagination={{ pageSize: 15, showTotal: function(t) { return t + ' quotes'; } }} />
          </>
        )}

        {activeTab === 'transactions' && (
          <Table dataSource={[].concat(invoices.map(function(i) { return Object.assign({}, i, { docType: 'Invoice' }); }), quotes.map(function(q) { return Object.assign({}, q, { docType: 'Quote' }); }))
            .sort(function(a, b) { return (b.id || 0) - (a.id || 0); })}
            columns={[
              { title: 'Type', dataIndex: 'docType', key: 'type', width: 80, render: function(t) { return <Tag color={t === 'Invoice' ? 'blue' : 'purple'}>{t}</Tag>; } },
              { title: '#', dataIndex: 'number', key: 'number', width: 110,
                render: function(t, r) { return <Link to={'/main/customers/' + (r.docType === 'Invoice' ? 'invoices' : 'quotes') + '/edit/' + r.id}>{t || '#' + r.id}</Link>; } },
              { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100, render: function(d) { return d ? moment(d).format('DD/MM/YYYY') : '-'; } },
              { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
                render: function(v) { return <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
              { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
                render: function(s) { return <Tag color={statusColors[s] || 'default'}>{s}</Tag>; } },
            ]}
            rowKey={function(r) { return r.docType + '-' + r.id; }} size="small"
            pagination={{ pageSize: 20, showTotal: function(t) { return t + ' transactions'; } }} />
        )}

        {activeTab === 'statements' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" onClick={function() { history.push('/main/customers/statements/new'); }}>Generate Statement</Button>
            </div>
            <Table dataSource={invoices}
              columns={[
                { title: 'Date', dataIndex: 'start_date', key: 'date', render: function(d) { return d ? moment(d).format('DD/MM/YYYY') : '-'; } },
                { title: 'Description', key: 'desc', render: function(_, r) { return 'Invoice ' + (r.number || '#' + r.id); } },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', render: function(v) { return <span>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
                { title: 'Status', dataIndex: 'status', key: 'status', render: function(s) { return <Tag color={statusColors[s] || 'default'}>{s}</Tag>; } },
                { title: 'Balance', key: 'balance', render: function(_, r) { return r.status === 'Paid' ? `${cSym} 0.00` : <span style={{ color: '#f5222d' }}>{cSym} {Number(r.amount || 0).toFixed(2)}</span>; } },
              ]}
              rowKey="id" size="small" pagination={false}
              summary={function() { return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><strong>Total Outstanding</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2}><strong>{cSym} {totalReceivables.toFixed(2)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} colSpan={2} />
                </Table.Summary.Row>
              ); }} />
          </>
        )}
      </div>

      <Modal title="Edit Customer" visible={editOpen} onOk={handleUpdate} onCancel={() => setEditOpen(false)} okText="Save">
        <Form form={form} layout="vertical">
          <Form.Item name="display_name" label="Display Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="company" label="Company"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
          </Row>
          <Form.Item name="phone_number" label="Phone"><Input /></Form.Item>
          <Form.Item name="billing_address" label="Billing Address"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
    </Spin>
  );
};

export default CustomerDetails;
