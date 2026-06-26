import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tabs, Button, Space, Tag, Statistic, Row, Col, message, Form, Input, Modal, Spin, Select, Empty, List, Avatar, Divider } from 'antd';
import { ArrowLeftOutlined, EditOutlined, FileTextOutlined, DollarOutlined, PlusOutlined, LeftOutlined, RightOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useParams, useHistory, Link } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import CustomerPaymentHistory from './payments/CustomerPaymentHistory';

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
      phone_number: customer.phone_number || customer.mobile_number,
      mobile_number: customer.mobile_number || '',
      address1: customer.address1 || customer.billing_address || '',
      address2: customer.address2 || '',
      city: customer.city || '',
      state: customer.state || '',
      postal_code: customer.postal_code || '',
      country: customer.country || '',
      notes: customer.notes,
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const vals = await form.validateFields();
      await window.electronAPI.updateCustomer?.({ id: Number(id), display_name: vals.display_name, company_name: vals.company, email: vals.email, phone_number: vals.phone_number, mobile_number: vals.mobile_number, address1: vals.address1, address2: vals.address2, city: vals.city, state: vals.state, postal_code: vals.postal_code, country: vals.country, notes: vals.notes });
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
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due', dataIndex: 'last_date', key: 'due', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const quoteColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 110,
      render: (t, r) => <Link to={`/main/customers/quotes/edit/${r.id}`}>{t || `#${r.id}`}</Link> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
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
            <span style={{ color: '#888' }}>{(customer?.email && customer.email !== 'null') ? customer.email : ''} {(customer?.phone_number && customer.phone_number !== 'null') ? `• ${customer.phone_number}` : ''}</span>
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
            { key: 'payments', label: 'Payment History' },
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
                <Descriptions.Item label="Company">{(customer?.company_name && customer.company_name !== 'null') ? customer.company_name : '-'}</Descriptions.Item>
                <Descriptions.Item label="Email">{(customer?.email && customer.email !== 'null') ? customer.email : '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{(customer?.phone_number && customer.phone_number !== 'null') ? customer.phone_number : ((customer?.mobile_number && customer.mobile_number !== 'null') ? customer.mobile_number : '-')}</Descriptions.Item>
                <Descriptions.Item label="Balance">{cSym} {Number(customer?.opening_balance || 0).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{(customer?.terms && customer.terms !== 'null') ? customer.terms : ((customer?.payment_method && customer.payment_method !== 'null') ? customer.payment_method : '-')}</Descriptions.Item>
                <Descriptions.Item label="Billing Address" span={2}>{(customer?.address1 && customer.address1 !== 'null') ? customer.address1 : '-'}</Descriptions.Item>
                <Descriptions.Item label="Notes" span={2}>{(customer?.notes && customer.notes !== 'null') ? customer.notes : '-'}</Descriptions.Item>
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
                          description={`${cSym} ${Number(inv.amount || 0).toFixed(2)} — ${inv.start_date ? moment(inv.start_date).format('MM/DD/YYYY') : ''}`} />
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
                          description={`${cSym} ${Number(q.amount || 0).toFixed(2)} — ${q.start_date ? moment(q.start_date).format('MM/DD/YYYY') : ''}`} />
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
              { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100, render: function(d) { return d ? moment(d).format('MM/DD/YYYY') : '-'; } },
              { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
                render: function(v) { return <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
              { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
                render: function(s) { return <Tag color={statusColors[s] || 'default'}>{s}</Tag>; } },
            ]}
            rowKey={function(r) { return r.docType + '-' + r.id; }} size="small"
            pagination={{ pageSize: 20, showTotal: function(t) { return t + ' transactions'; } }} />
        )}

        {activeTab === 'payments' && (
          <CustomerPaymentHistory customerId={id} mode="customer" embedded />
        )}

        {activeTab === 'statements' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" onClick={function() { history.push('/main/customers/statements/new'); }}>Generate Statement</Button>
            </div>
            <Table dataSource={invoices}
              columns={[
                { title: 'Date', dataIndex: 'start_date', key: 'date', render: function(d) { return d ? moment(d).format('MM/DD/YYYY') : '-'; } },
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

      <Modal title="Edit Customer" visible={editOpen} onOk={handleUpdate} onCancel={() => setEditOpen(false)} okText="Save" width={800}>
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 16 }}>
            <Form.Item name="display_name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="company" label="Company"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
            <Form.Item name="phone_number" label="Phone"><Input /></Form.Item>
            <Form.Item name="mobile_number" label="Mobile"><Input /></Form.Item>
            <Form.Item name="address1" label="Street Address"><Input placeholder="123 Main St" /></Form.Item>
            <Form.Item name="address2" label="Address Line 2"><Input placeholder="Apt/Suite" /></Form.Item>
            <Form.Item name="city" label="City"><Input /></Form.Item>
            <Form.Item name="state" label="State"><Input /></Form.Item>
            <Form.Item name="postal_code" label="ZIP"><Input /></Form.Item>
            <Form.Item name="country" label="Country">
              <Select showSearch placeholder="Select a country">
                <Select.Option value="Afghanistan">Afghanistan</Select.Option>
                <Select.Option value="Albania">Albania</Select.Option>
                <Select.Option value="Algeria">Algeria</Select.Option>
                <Select.Option value="Andorra">Andorra</Select.Option>
                <Select.Option value="Angola">Angola</Select.Option>
                <Select.Option value="Antigua and Barbuda">Antigua and Barbuda</Select.Option>
                <Select.Option value="Argentina">Argentina</Select.Option>
                <Select.Option value="Armenia">Armenia</Select.Option>
                <Select.Option value="Australia">Australia</Select.Option>
                <Select.Option value="Austria">Austria</Select.Option>
                <Select.Option value="Azerbaijan">Azerbaijan</Select.Option>
                <Select.Option value="Bahamas">Bahamas</Select.Option>
                <Select.Option value="Bahrain">Bahrain</Select.Option>
                <Select.Option value="Bangladesh">Bangladesh</Select.Option>
                <Select.Option value="Barbados">Barbados</Select.Option>
                <Select.Option value="Belarus">Belarus</Select.Option>
                <Select.Option value="Belgium">Belgium</Select.Option>
                <Select.Option value="Belize">Belize</Select.Option>
                <Select.Option value="Benin">Benin</Select.Option>
                <Select.Option value="Bhutan">Bhutan</Select.Option>
                <Select.Option value="Bolivia">Bolivia</Select.Option>
                <Select.Option value="Bosnia and Herzegovina">Bosnia and Herzegovina</Select.Option>
                <Select.Option value="Botswana">Botswana</Select.Option>
                <Select.Option value="Brazil">Brazil</Select.Option>
                <Select.Option value="Brunei">Brunei</Select.Option>
                <Select.Option value="Bulgaria">Bulgaria</Select.Option>
                <Select.Option value="Burkina Faso">Burkina Faso</Select.Option>
                <Select.Option value="Burundi">Burundi</Select.Option>
                <Select.Option value="Cabo Verde">Cabo Verde</Select.Option>
                <Select.Option value="Cambodia">Cambodia</Select.Option>
                <Select.Option value="Cameroon">Cameroon</Select.Option>
                <Select.Option value="Canada">Canada</Select.Option>
                <Select.Option value="Central African Republic">Central African Republic</Select.Option>
                <Select.Option value="Chad">Chad</Select.Option>
                <Select.Option value="Chile">Chile</Select.Option>
                <Select.Option value="China">China</Select.Option>
                <Select.Option value="Colombia">Colombia</Select.Option>
                <Select.Option value="Comoros">Comoros</Select.Option>
                <Select.Option value="Congo">Congo</Select.Option>
                <Select.Option value="Costa Rica">Costa Rica</Select.Option>
                <Select.Option value="Croatia">Croatia</Select.Option>
                <Select.Option value="Cuba">Cuba</Select.Option>
                <Select.Option value="Cyprus">Cyprus</Select.Option>
                <Select.Option value="Czech Republic">Czech Republic</Select.Option>
                <Select.Option value="Denmark">Denmark</Select.Option>
                <Select.Option value="Djibouti">Djibouti</Select.Option>
                <Select.Option value="Dominica">Dominica</Select.Option>
                <Select.Option value="Dominican Republic">Dominican Republic</Select.Option>
                <Select.Option value="Ecuador">Ecuador</Select.Option>
                <Select.Option value="Egypt">Egypt</Select.Option>
                <Select.Option value="El Salvador">El Salvador</Select.Option>
                <Select.Option value="Equatorial Guinea">Equatorial Guinea</Select.Option>
                <Select.Option value="Eritrea">Eritrea</Select.Option>
                <Select.Option value="Estonia">Estonia</Select.Option>
                <Select.Option value="Eswatini">Eswatini</Select.Option>
                <Select.Option value="Ethiopia">Ethiopia</Select.Option>
                <Select.Option value="Fiji">Fiji</Select.Option>
                <Select.Option value="Finland">Finland</Select.Option>
                <Select.Option value="France">France</Select.Option>
                <Select.Option value="Gabon">Gabon</Select.Option>
                <Select.Option value="Gambia">Gambia</Select.Option>
                <Select.Option value="Georgia">Georgia</Select.Option>
                <Select.Option value="Germany">Germany</Select.Option>
                <Select.Option value="Ghana">Ghana</Select.Option>
                <Select.Option value="Greece">Greece</Select.Option>
                <Select.Option value="Grenada">Grenada</Select.Option>
                <Select.Option value="Guatemala">Guatemala</Select.Option>
                <Select.Option value="Guinea">Guinea</Select.Option>
                <Select.Option value="Guinea-Bissau">Guinea-Bissau</Select.Option>
                <Select.Option value="Guyana">Guyana</Select.Option>
                <Select.Option value="Haiti">Haiti</Select.Option>
                <Select.Option value="Honduras">Honduras</Select.Option>
                <Select.Option value="Hungary">Hungary</Select.Option>
                <Select.Option value="Iceland">Iceland</Select.Option>
                <Select.Option value="India">India</Select.Option>
                <Select.Option value="Indonesia">Indonesia</Select.Option>
                <Select.Option value="Iran">Iran</Select.Option>
                <Select.Option value="Iraq">Iraq</Select.Option>
                <Select.Option value="Ireland">Ireland</Select.Option>
                <Select.Option value="Israel">Israel</Select.Option>
                <Select.Option value="Italy">Italy</Select.Option>
                <Select.Option value="Jamaica">Jamaica</Select.Option>
                <Select.Option value="Japan">Japan</Select.Option>
                <Select.Option value="Jordan">Jordan</Select.Option>
                <Select.Option value="Kazakhstan">Kazakhstan</Select.Option>
                <Select.Option value="Kenya">Kenya</Select.Option>
                <Select.Option value="Kiribati">Kiribati</Select.Option>
                <Select.Option value="Kuwait">Kuwait</Select.Option>
                <Select.Option value="Kyrgyzstan">Kyrgyzstan</Select.Option>
                <Select.Option value="Laos">Laos</Select.Option>
                <Select.Option value="Latvia">Latvia</Select.Option>
                <Select.Option value="Lebanon">Lebanon</Select.Option>
                <Select.Option value="Lesotho">Lesotho</Select.Option>
                <Select.Option value="Liberia">Liberia</Select.Option>
                <Select.Option value="Libya">Libya</Select.Option>
                <Select.Option value="Liechtenstein">Liechtenstein</Select.Option>
                <Select.Option value="Lithuania">Lithuania</Select.Option>
                <Select.Option value="Luxembourg">Luxembourg</Select.Option>
                <Select.Option value="Madagascar">Madagascar</Select.Option>
                <Select.Option value="Malawi">Malawi</Select.Option>
                <Select.Option value="Malaysia">Malaysia</Select.Option>
                <Select.Option value="Maldives">Maldives</Select.Option>
                <Select.Option value="Mali">Mali</Select.Option>
                <Select.Option value="Malta">Malta</Select.Option>
                <Select.Option value="Marshall Islands">Marshall Islands</Select.Option>
                <Select.Option value="Mauritania">Mauritania</Select.Option>
                <Select.Option value="Mauritius">Mauritius</Select.Option>
                <Select.Option value="Mexico">Mexico</Select.Option>
                <Select.Option value="Micronesia">Micronesia</Select.Option>
                <Select.Option value="Moldova">Moldova</Select.Option>
                <Select.Option value="Monaco">Monaco</Select.Option>
                <Select.Option value="Mongolia">Mongolia</Select.Option>
                <Select.Option value="Montenegro">Montenegro</Select.Option>
                <Select.Option value="Morocco">Morocco</Select.Option>
                <Select.Option value="Mozambique">Mozambique</Select.Option>
                <Select.Option value="Myanmar">Myanmar</Select.Option>
                <Select.Option value="Namibia">Namibia</Select.Option>
                <Select.Option value="Nauru">Nauru</Select.Option>
                <Select.Option value="Nepal">Nepal</Select.Option>
                <Select.Option value="Netherlands">Netherlands</Select.Option>
                <Select.Option value="New Zealand">New Zealand</Select.Option>
                <Select.Option value="Nicaragua">Nicaragua</Select.Option>
                <Select.Option value="Niger">Niger</Select.Option>
                <Select.Option value="Nigeria">Nigeria</Select.Option>
                <Select.Option value="North Korea">North Korea</Select.Option>
                <Select.Option value="North Macedonia">North Macedonia</Select.Option>
                <Select.Option value="Norway">Norway</Select.Option>
                <Select.Option value="Oman">Oman</Select.Option>
                <Select.Option value="Pakistan">Pakistan</Select.Option>
                <Select.Option value="Palau">Palau</Select.Option>
                <Select.Option value="Palestine">Palestine</Select.Option>
                <Select.Option value="Panama">Panama</Select.Option>
                <Select.Option value="Papua New Guinea">Papua New Guinea</Select.Option>
                <Select.Option value="Paraguay">Paraguay</Select.Option>
                <Select.Option value="Peru">Peru</Select.Option>
                <Select.Option value="Philippines">Philippines</Select.Option>
                <Select.Option value="Poland">Poland</Select.Option>
                <Select.Option value="Portugal">Portugal</Select.Option>
                <Select.Option value="Qatar">Qatar</Select.Option>
                <Select.Option value="Romania">Romania</Select.Option>
                <Select.Option value="Russia">Russia</Select.Option>
                <Select.Option value="Rwanda">Rwanda</Select.Option>
                <Select.Option value="Saint Kitts and Nevis">Saint Kitts and Nevis</Select.Option>
                <Select.Option value="Saint Lucia">Saint Lucia</Select.Option>
                <Select.Option value="Saint Vincent and the Grenadines">Saint Vincent and the Grenadines</Select.Option>
                <Select.Option value="Samoa">Samoa</Select.Option>
                <Select.Option value="San Marino">San Marino</Select.Option>
                <Select.Option value="Sao Tome and Principe">Sao Tome and Principe</Select.Option>
                <Select.Option value="Saudi Arabia">Saudi Arabia</Select.Option>
                <Select.Option value="Senegal">Senegal</Select.Option>
                <Select.Option value="Serbia">Serbia</Select.Option>
                <Select.Option value="Seychelles">Seychelles</Select.Option>
                <Select.Option value="Sierra Leone">Sierra Leone</Select.Option>
                <Select.Option value="Singapore">Singapore</Select.Option>
                <Select.Option value="Slovakia">Slovakia</Select.Option>
                <Select.Option value="Slovenia">Slovenia</Select.Option>
                <Select.Option value="Solomon Islands">Solomon Islands</Select.Option>
                <Select.Option value="Somalia">Somalia</Select.Option>
                <Select.Option value="South Africa">South Africa</Select.Option>
                <Select.Option value="South Korea">South Korea</Select.Option>
                <Select.Option value="South Sudan">South Sudan</Select.Option>
                <Select.Option value="Spain">Spain</Select.Option>
                <Select.Option value="Sri Lanka">Sri Lanka</Select.Option>
                <Select.Option value="Sudan">Sudan</Select.Option>
                <Select.Option value="Suriname">Suriname</Select.Option>
                <Select.Option value="Sweden">Sweden</Select.Option>
                <Select.Option value="Switzerland">Switzerland</Select.Option>
                <Select.Option value="Syria">Syria</Select.Option>
                <Select.Option value="Taiwan">Taiwan</Select.Option>
                <Select.Option value="Tajikistan">Tajikistan</Select.Option>
                <Select.Option value="Tanzania">Tanzania</Select.Option>
                <Select.Option value="Thailand">Thailand</Select.Option>
                <Select.Option value="Timor-Leste">Timor-Leste</Select.Option>
                <Select.Option value="Togo">Togo</Select.Option>
                <Select.Option value="Tonga">Tonga</Select.Option>
                <Select.Option value="Trinidad and Tobago">Trinidad and Tobago</Select.Option>
                <Select.Option value="Tunisia">Tunisia</Select.Option>
                <Select.Option value="Turkey">Turkey</Select.Option>
                <Select.Option value="Turkmenistan">Turkmenistan</Select.Option>
                <Select.Option value="Tuvalu">Tuvalu</Select.Option>
                <Select.Option value="Uganda">Uganda</Select.Option>
                <Select.Option value="Ukraine">Ukraine</Select.Option>
                <Select.Option value="United Arab Emirates">United Arab Emirates</Select.Option>
                <Select.Option value="United Kingdom">United Kingdom</Select.Option>
                <Select.Option value="United States">United States</Select.Option>
                <Select.Option value="Uruguay">Uruguay</Select.Option>
                <Select.Option value="Uzbekistan">Uzbekistan</Select.Option>
                <Select.Option value="Vanuatu">Vanuatu</Select.Option>
                <Select.Option value="Vatican City">Vatican City</Select.Option>
                <Select.Option value="Venezuela">Venezuela</Select.Option>
                <Select.Option value="Vietnam">Vietnam</Select.Option>
                <Select.Option value="Yemen">Yemen</Select.Option>
                <Select.Option value="Zambia">Zambia</Select.Option>
                <Select.Option value="Zimbabwe">Zimbabwe</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
    </Spin>
  );
};

export default CustomerDetails;
