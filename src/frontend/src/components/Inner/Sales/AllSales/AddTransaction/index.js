import React, { useState } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space,Upload,Dropdown } from 'antd';
import { InboxOutlined,DownOutlined,IdcardOutlined,GlobalOutlined,EditOutlined,CreditCardOutlined,AuditOutlined,UpOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

const { Option } = Select;

const AddTransaction = ({type}) => {
  const [open, setOpen] = useState(false);
  const [visible1, setVisible1] = useState(true);
  const [visible2, setVisible2] = useState(true);
  const [visible3, setVisible3] = useState(true);
  const [visible4, setVisible4] = useState(true);
  const [visible5, setVisible5] = useState(true);
  const toggleVisibility1 = () => {
    setVisible1(!visible1);
  };
  const toggleVisibility2 = () => {
    setVisible2(!visible2);
  };
  const toggleVisibility3 = () => {
    setVisible3(!visible3);
  };
  const toggleVisibility4 = () => {
    setVisible4(!visible4);
  };
  const toggleVisibility5 = () => {
    setVisible5(!visible5);
  };

    const [options, setOptions] = useState([
      { label: 'Cash', value: 'cash' },
      { label: 'Cheque', value: 'cheque' },
      { label: 'Credit Card', value: 'creditCard' },
      { label: 'Direct Debit', value: 'directDebit' },
    ]);
  
    const handleAddNew = () => {
      console.log("Add new payment method");
    };
  const showDrawer = () => {
    setOpen(true);
  };
  const onClose = () => {
    setOpen(false);
  };
  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: `Invoice`,
      key: '1',
    },
    {
      label: `Import Invoices`,
      key: '2',
    },
    {
      label: `Payment`,
      key: '3',
    },
    {
      label: `Quote`,
      key: '4',
    },
    {
      label: `Sales Receipt`,
      key: '5',
    },
    {
      label: `Credit Note`,
      key: '6',
    },
    {
      label: `Refund Receipt`,
      key: '7',
    },
  ];
  return (

    <>
       <p className={`gx-text-primary gx-mb-0 gx-pointer gx-d-none gx-d-sm-block`} onClick={showDrawer}>
       <Dropdown.Button
       type="primary"
        icon={<DownOutlined />}
        menu={{
          items,
        }}
        onClick={() => {}}
      >
        New {type}
      </Dropdown.Button>
       </p>
     
      <Drawer
        title={`Add ${type}`}
        size='medium'
        width={400}
        onClose={onClose}
        open={open}
        styles={{
          body: {
            paddingBottom: 80,
          },
        }}
        footer={
          <div
            style={{
              textAlign: 'right',
            }}
          >
                  <Row>
        <Col span={12}>
        <Space>
        <Button onClick={onClose} type="primary">
              Save Details
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          
          </Space>
        </Col>
      </Row>
          </div>
        }
      >
      
  <Form layout="" {...layout}>
  <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><IdcardOutlined /> Name and contact</h3> 
      }
      extra={
        <span onClick={toggleVisibility1} style={{ cursor: 'pointer' }}>
        {visible1 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }
      >
         {visible1 && (
         <>
          <Row gutter={2}>           
            <Col span={3}>
              <Form.Item name="name_title" label="Title" rules={[{ required: true, message: 'Title', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'First Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="middle_name" label="Middle Name" rules={[{ required: true, message: 'Middle Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Last Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>            
              <Col span={3}>
              <Form.Item name="suffix" label="Suffix" rules={[{ required: true, message: 'Suffix', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="display_customer_name" label="Customer Display Name" rules={[{ required: true, message: 'Customer Display Name', },]}>
                   <Input placeholder="Enter Customer Display Name" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="company_name" label="Company Name" rules={[{ required: true, message: 'Company Name', },]}>
                   <Input placeholder="Enter Company Name" /> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Email', },]}>
                   <Input placeholder="Enter Email" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="phone_number" label="Phone number" rules={[{ required: true, message: 'Phone number', },]}>
                   <Input placeholder="Enter Phone number" /> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="mobile_number" label="Mobile number" rules={[{ required: true, message: 'Mobile number', },]}>
                   <Input placeholder="Enter Mobile number" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="fax" label="Fax" rules={[{ required: true, message: 'Fax', },]}>
                   <Input placeholder="Enter Fax" /> 
              </Form.Item>
              </Col>
              </Row>
              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="other" label="Other">
                   <Input placeholder="Enter Other" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="website" label="Website">
                   <Input placeholder="Enter Website" /> 
              </Form.Item>
              </Col>
              </Row>
              </>
         )}
              </Widget>


              <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><GlobalOutlined /> Addresses</h3> 
      }
      extra={
        <span onClick={toggleVisibility2} style={{ cursor: 'pointer' }}>
        {visible2 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }>
         {visible2 && (
          <>
<h3 className="h3 gx-text-capitalize gx-mb-0">Billing Address</h3> 
<Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="street_address_1" label="Street address 1">
                   <Input placeholder="Enter Street address 1"/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="street_address_2" label="Street address 2">
                   <Input placeholder="Enter Street address 2"/> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="city" label="City">
                   <Input placeholder="Enter City" rules={[{ required: true, message: 'City', },]}/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="state" label="State">
                   <Input placeholder="Enter State" rules={[{ required: true, message: 'State', },]}/> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="postal_code" label="Postal code">
                   <Input placeholder="Enter Postal code" rules={[{ required: true, message: 'Postal code', },]}/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="country" label="Country">
                   <Input placeholder="Enter country" rules={[{ required: true, message: 'Country', },]}/> 
              </Form.Item>
              </Col>
              </Row>
              </>
)}
        </Widget>

        <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><EditOutlined /> Notes and attachments</h3> 
      }  extra={
        <span onClick={toggleVisibility3} style={{ cursor: 'pointer' }}>
        {visible3 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }>
         {visible3 && (
        
        <Row gutter={16}>
        <Col span={24}>
        <Form.Item name="notes" label="Notes">
        <Input placeholder="Make Notes" autosize={{minRows: 2, maxRows: 6}}  margin="normal"/>
                </Form.Item>
        </Col>
            <Col span={24}>
            <Form.Item label="Attachments" name="attachments">
      <Form.Item name="dragger" valuePropName="fileList" noStyle>
        <Upload.Dragger name="files" action="/upload.do">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag file to this area to upload</p>
        </Upload.Dragger>
      </Form.Item>
    </Form.Item>
            </Col>
           </Row>
         )}
      </Widget>

      <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><CreditCardOutlined /> Payments</h3> 
      }  extra={
        <span onClick={toggleVisibility4} style={{ cursor: 'pointer' }}>
        {visible4 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }>
         {visible4 && (
         
<Row gutter={16}>           
            <Col span={12}>
            <Form.Item
      name="payment_method"
      label="Primary payment method"
      rules={[
        {
          required: true,
          message: 'Please select payment method',
          type: 'array',
        },
      ]}
    >
      <Select
      placeholder="Primary payment method"
      dropdownRender={(menu) => (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              color: '#fff',
              backgroundColor: '#52c41a',
              cursor: 'pointer',
            }}
            onClick={handleAddNew}
          >
            + Add new
          </div>
          {menu}
        </>
      )}
    >
      {options.map((option) => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Select>
    </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item
      name="terms"
      label="Terms"
      rules={[
        {
          required: true,
          message: 'Please select terms',
          type: 'array',
        },
      ]}
    >
      <Select mode="single" placeholder="Please select terms">
        <Option value="Net15">Net15</Option>
        <Option value="Net30">Net30</Option>
        <Option value="Net60">Net60</Option>
      </Select>
    </Form.Item>
              </Col>
              </Row>
         )}              
              </Widget>

              <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><AuditOutlined /> Additional Information</h3> 
      }
      extra={
        <span onClick={toggleVisibility5} style={{ cursor: 'pointer' }}>
        {visible5 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }>
        {visible5 && (
          <>
<h3 className="h3 gx-text-capitalize gx-mb-0">Taxes</h3> 
<Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="vat" label="Vat Registration Number">
                   <Input placeholder="Enter Vat Registration Number"/> 
              </Form.Item>
              </Col>
              </Row>
              </>
        )}
              </Widget>

              <Widget
      title={
        <h3 className="h3 gx-text-capitalize gx-mb-0"><AuditOutlined /> Additional Information</h3> 
      }
      extra={
        <span onClick={toggleVisibility5} style={{ cursor: 'pointer' }}>
        {visible5 ? <DownOutlined /> : <UpOutlined />}
      </span>
      }>
        {visible5 && (
          <>
<h3 className="h3 gx-text-capitalize gx-mb-0">Taxes</h3> 
<Row gutter={16}>           
            <Col span={24}>
              <Form.Item name="business_number" label="Business ID Number / Social Security Number">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <h3 className="h3 gx-text-capitalize gx-mb-0">Expense Rates</h3> 
              <h3 className="h4 gx-text-capitalize gx-mb-0">Payments</h3> 
<Row gutter={16}>           
            <Col span={24}>
              <Form.Item name="business_number" label="Business ID Number / Social Security Number">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="business_terms" label="Terms">
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="account_number" label="Account Number">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>
              <h3 className="h3 gx-text-capitalize gx-mb-0">Accounting</h3> 
              <Row gutter={16}>           
            <Col span={24}>
              <Form.Item name="expense_category" label="Default Expense Category">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <h3 className="h3 gx-text-capitalize gx-mb-0">Opening Balance</h3> 
              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="opening_balance" label="Opening Balance">
                   <Input/> 
              </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item name="as_of" label="As of">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>
              </>
        )}
              </Widget>
              </Form>

        
      </Drawer>
    </>
  );
};
export default AddTransaction;