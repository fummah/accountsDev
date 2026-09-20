import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message, Modal, Form, Input } from 'antd';
import { ArrowLeftOutlined, ShopOutlined, DollarOutlined, FileTextOutlined, ClockCircleOutlined, ImportOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { formatPhone } from '../../utils/phone';
import CsvImportModal from '../common/CsvImportModal';
import FormSection, { FORM_ITEM_STYLE, MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from '../shared/FormSection';
import ContactIdentityNote from '../shared/ContactIdentityNote';
import TaxSettingsSection from '../shared/TaxSettingsSection';
import { deriveDisplayName, identityRule } from '../../utils/contactIdentity';
import { resolveTaxRateFields } from '../../utils/taxRate';

const { TabPane } = Tabs;

const VendorCenter = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalVendors: 0,
    totalPayables: 0,
    overdueAmount: 0,
    unpaidBills: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const [activeKey, setActiveKey] = useState('vendors');

  const [showAddVendor, setShowAddVendor] = React.useState(false);
  const [importVisible, setImportVisible] = React.useState(false);
  const [vendorForm] = Form.useForm();
  const [vatRates, setVatRates] = useState([]);

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

  const onCreateVendor = async (values) => {
    try {
      const title = '';
      const first_name = values.first_name || '';
      const middle_name = '';
      const last_name = '';
      const suffix = '';
      const email = values.email || '';
      // Shared rule: explicit -> personal name -> company. The old expression
      // was `values.display_name || values.first_name`, which ignored BOTH the
      // last name and the company name, so a company-only vendor was stored
      // with a blank display name and rendered as an empty row.
      const display_name = deriveDisplayName(values);
      const company_name = values.company_name || '';
      const phone_number = values.phone_number || '';
      const mobile_number = values.mobile_number || '';
      const fax = '';
      const other = '';
      const website = '';
      const address1 = values.address1 || '';
      const address2 = values.address2 || '';
      const city = values.city || '';
      const state = values.state || '';
      const postal_code = values.zip || '';
      const country = values.country || '';
      const supplier_terms = '';
      const business_number = '';
      const account_number = '';
      const expense_category = '';
      const opening_balance = values.opening_balance || 0;
      const as_of = null;
      const entered_by = 'system';
      const notes = '';
      const vendor_type = 'Regular'; // VendorCenter has no vendor_type field; default
      const tax = resolveTaxRateFields(values, vatRates);

      const res = await window.electronAPI.insertSupplier(title, first_name, middle_name, last_name, suffix, email, display_name, company_name, phone_number, mobile_number, fax, other, website, address1, address2, city, state, postal_code, country, supplier_terms, business_number, account_number, expense_category, opening_balance, as_of, entered_by, notes, vendor_type,
        values.taxable != null ? values.taxable : true,
        tax.default_tax_rate,
        tax.default_tax_rate_id
      );
      if (res && res.success) {
        message.success('Vendor added');
        setShowAddVendor(false);
        vendorForm.resetFields();
        await loadData();
      } else {
        // Show the backend's reason when it gives one (e.g. the identity rule)
        // instead of a generic failure — the API and the form agree on the text.
        message.error((res && res.error) || 'Failed to add vendor');
      }
    } catch (err) {
      console.error('Error adding vendor', err);
      message.error('Error adding vendor');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [vendorsData, billsData] = await Promise.all([
        window.electronAPI.getAllSuppliers(),
        window.electronAPI.getAllExpenses()
      ]);

  // normalize backend response shapes
  const vendorsList = Array.isArray(vendorsData) ? vendorsData : (vendorsData && vendorsData.all) ? vendorsData.all : (vendorsData && vendorsData.data) ? vendorsData.data : [];
  const billsList = Array.isArray(billsData) ? billsData : (billsData && billsData.all) ? billsData.all : (billsData && billsData.data) ? billsData.data : [];

  setVendors(vendorsList);
  setBills(billsList);

      // Calculate statistics
      const isUnpaid = (b) => ((b.approval_status || '').toLowerCase() !== 'paid');
      const totalPayables = billsList.reduce((sum, bill) => sum + (isUnpaid(bill) ? Number(bill.amount || 0) : 0), 0);
      const overdueAmount = billsList.reduce((sum, bill) => {
        const date = bill.payment_date || bill.dueDate;
        const isOverdue = isUnpaid(bill) && date && moment(date).isBefore(moment(), 'day');
        return sum + (isOverdue ? Number(bill.amount || 0) : 0);
      }, 0);
      const unpaidBills = billsList.filter(isUnpaid).length;

      setStats({
        totalVendors: vendorsList.length,
        totalPayables,
        overdueAmount,
        unpaidBills
      });
    } catch (error) {
      message.error('Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  };

  const vendorColumns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      render: (text, record) => (
        <Link to={`/main/vendors/details/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone_number',
      key: 'phone',
      render: v => formatPhone(v) || '-',
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (_, record) => `${cSym} ${record.opening_balance || '0.00'}`,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => history.push(`/main/vendors/bills/new?vendor=${record.id}`)}>
            Enter Bill
          </Button>
          <Button type="link" onClick={() => history.push(`/main/vendors/details/${record.id}`)}>
            View Details
          </Button>
        </Space>
      ),
    },
  ];

    const billColumns = [
    {
      title: 'Bill #',
      dataIndex: 'ref_no',
      key: 'billNumber',
      render: (text, record) => (
        <Link to={`/main/vendors/bills/edit/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'payee_name',
      key: 'vendor',
    },
    {
      title: 'Date',
      dataIndex: 'payment_date',
      key: 'date',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Due Date',
      dataIndex: 'payment_date',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Amount',
      key: 'amount',
      render: (_, record) => {
        const total = record.amount || 0;
        return `${cSym} ${Number(total).toFixed(2)}`;
      },
    },
    {
      title: 'Status',
      dataIndex: 'approval_status',
      key: 'status',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Vendor Center</h2>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Vendors"
              value={stats.totalVendors}
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Payables"
              value={stats.totalPayables}
              precision={2}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Overdue Amount"
              value={stats.overdueAmount}
              precision={2}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Unpaid Bills"
              value={stats.unpaidBills}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs activeKey={activeKey} onChange={setActiveKey} destroyInactiveTabPane>
          <TabPane tab="Vendors" key="vendors">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" onClick={() => setShowAddVendor(true)}>
                Add Vendor
              </Button>
              <Button icon={<ImportOutlined />} style={{ marginLeft: 8 }} onClick={() => setImportVisible(true)}>
                Import CSV
              </Button>
            </div>
            <Table
              columns={vendorColumns}
              dataSource={vendors}
              rowKey="id"
              loading={loading}
            />
            <div style={{ marginTop: 16 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            </div>
              <CsvImportModal
                visible={importVisible}
                onClose={() => setImportVisible(false)}
                title="Import Vendors / Suppliers"
                description="Paste a QuickBooks supplier CSV export. Recognizes 'Vendor', 'Company', 'Balance Total', 'Bill from 1..5', 'Main Phone', 'Alt. Phone', 'Fax' and 'First/M.I./Last Name' columns."
                importFn={(csv, opts) => window.electronAPI.importSuppliersCsv(csv, opts)}
                onImported={loadData}
              />
              <Modal
                title="Add Vendor"
                visible={showAddVendor}
                onCancel={() => { setShowAddVendor(false); vendorForm.resetFields(); }}
                onOk={() => vendorForm.submit()}
                okText="Create Vendor"
                width={MODAL_WIDTH}
                bodyStyle={MODAL_BODY_SCROLL_STYLE}
                destroyOnClose
              >
                <Form form={vendorForm} layout="vertical" onFinish={onCreateVendor}>
                  <FormSection title="Vendor Information" icon={<ShopOutlined />}>
                    <Row gutter={12}>
                      <Col xs={24} md={12} lg={8}>
                        {/* Label is "First Name", not "Vendor Name": the field is
                            the personal-name half of the pair, and calling it
                            "Vendor Name" implied the whole identity belonged here.
                            No `*` on either field — the requirement is the pair. */}
                        <Form.Item name="first_name" label="First Name" style={FORM_ITEM_STYLE} rules={identityRule(vendorForm)}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={8}>
                        <Form.Item name="display_name" label="Display Name" style={FORM_ITEM_STYLE}>
                          <Input placeholder="Auto-generated if blank" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={8}>
                        <Form.Item name="company_name" label="Company Name" style={FORM_ITEM_STYLE}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <ContactIdentityNote />
                  </FormSection>

                  <FormSection title="Contact Information" icon={<PhoneOutlined />}>
                    <Row gutter={12}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="email" label="Email" style={FORM_ITEM_STYLE}>
                          <Input placeholder="vendor@example.com" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="phone_number" label="Phone" style={FORM_ITEM_STYLE}>
                          <Input
                            placeholder="(XXX) XXX-XXXX"
                            maxLength={14}
                            onChange={e => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                              let formatted = digits;
                              if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                              else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                              else if (digits.length > 0) formatted = `(${digits}`;
                              vendorForm.setFieldsValue({ phone_number: formatted });
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </FormSection>

                  <FormSection title="Address" icon={<EnvironmentOutlined />}>
                    <Row gutter={12}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="address1" label="Street Address" style={FORM_ITEM_STYLE}>
                          <Input placeholder="123 Main St" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="address2" label="Address Line 2" style={FORM_ITEM_STYLE}>
                          <Input placeholder="Suite 100" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="city" label="City" style={FORM_ITEM_STYLE}>
                          <Input placeholder="City" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="state" label="State" style={FORM_ITEM_STYLE}>
                          <Input placeholder="State" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="zip" label="ZIP Code" style={FORM_ITEM_STYLE}>
                          <Input placeholder="00000" />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item name="country" label="Country" style={FORM_ITEM_STYLE}>
                          <Input placeholder="US" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </FormSection>

                  <FormSection title="Payment Settings" icon={<DollarOutlined />}>
                    <Row gutter={12}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="opening_balance" label="Opening Balance" style={FORM_ITEM_STYLE}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                  </FormSection>

                  <TaxSettingsSection vatRates={vatRates} form={vendorForm} />
                </Form>
              </Modal>
          </TabPane>

          <TabPane tab="Bills" key="bills">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/vendors/bills/new">
                Enter Bill
              </Button>
            </div>
            <Table
              columns={billColumns}
              dataSource={bills}
              rowKey="id"
              loading={loading}
            />
            <div style={{ marginTop: 16 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default VendorCenter;