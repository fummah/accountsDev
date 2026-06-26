import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, message, Popconfirm, Modal, Form, DatePicker, Select } from 'antd';
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
        width={800}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddCustomer} preserve={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 16 }}>
            <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="last_name" label="Last Name"><Input /></Form.Item>
            <Form.Item name="display_name" label="Display Name"><Input /></Form.Item>
            <Form.Item name="company_name" label="Company"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
            <Form.Item name="phone_number" label="Phone"><Input /></Form.Item>
            <Form.Item name="mobile_number" label="Mobile"><Input /></Form.Item>
            <Form.Item name="address1" label="Street Address"><Input /></Form.Item>
            <Form.Item name="address2" label="Address Line 2"><Input /></Form.Item>
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
            <Form.Item name="notes" label="Notes"><Input /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerList;
