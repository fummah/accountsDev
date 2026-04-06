import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, DatePicker, Select, message, Divider, Modal, Row, Col } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;

const EnterBill = ({ history, location, match }) => {
  const { symbol: cSym } = useCurrency();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setVendors(Array.isArray(data) ? data : (data?.all || data?.data || []));
    } catch (err) {
      console.error('Failed to load vendors', err);
      message.error('Failed to load vendors');
    }
  };

  const handleAddSupplier = async () => {
    try {
      const vals = await supplierForm.validateFields();
      const display = `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.company || 'New Supplier';
      await window.electronAPI.insertSupplier?.(
        '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '', display,
        vals.company || '', vals.phone || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', null, ''
      );
      message.success('Supplier added');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
      loadVendors();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add supplier'); }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const payee = values.vendorId;
      const payment_account = values.payment_account || 'Accounts Payable';
      const payment_date = values.billDate ? values.billDate.format('YYYY-MM-DD') : null;
      const payment_method = values.payment_method || 'check';
      const ref_no = values.billNumber || '';
      const category = 'supplier';
      const entered_by = 'system';
      const approval_status = 'Pending';
      const expenseLines = [
        { category: 'Bills', description: values.description || '', amount: Number(values.amount) || 0 }
      ];

      const res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      if (res && res.success) {
        message.success('Bill created');
        form.resetFields();
        if (history && history.push) history.push('/main/vendors/bills/tracker');
      } else {
        message.error('Failed to create bill');
      }
    } catch (err) {
      console.error('Create bill error', err);
      message.error('Failed to create bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Enter Bill" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => (history?.length ? history.goBack() : history.push('/main/vendors/center'))}>Back</Button>}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}> 
          <Select showSearch placeholder="Select a vendor"
            dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Supplier</Button></>)}>
            {vendors.map(v => (
              <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name} ${v.last_name}`}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="payment_account" label="Payment Account" initialValue="Accounts Payable">
          <Select showSearch>
            <Option value="Accounts Payable">Accounts Payable</Option>
            <Option value="Cash and cash equivalents">Cash and cash equivalents</Option>
            <Option value="Bank">Bank</Option>
          </Select>
        </Form.Item>

        <Form.Item name="billNumber" label="Bill Number"><Input /></Form.Item>
        <Form.Item name="billDate" label="Bill Date"><DatePicker style={{ width: '100%' }} defaultValue={moment()} /></Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><Input type="number" prefix={cSym} /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>Create Bill</Button>
        </Form.Item>
      </Form>
      <Modal title="Add New Supplier" visible={supplierModalOpen} onOk={handleAddSupplier} onCancel={() => setSupplierModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={supplierForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="company" label="Company"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default EnterBill;
