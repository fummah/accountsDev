import React, { useState,forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space,Upload,Dropdown, DatePicker } from 'antd';
import { InboxOutlined,DownOutlined,IdcardOutlined,GlobalOutlined,EditOutlined,CreditCardOutlined,AuditOutlined,UpOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";
import dayjs from 'dayjs';

const { Option } = Select;

const AddCustomer = forwardRef(({ type,onSaveUser, onUserClose, showDrawer, open, user, setShowError,setMessage }, ref) => {
  
  const [visible1, setVisible1] = useState(true);
  const [visible2, setVisible2] = useState(true);
  const [visible3, setVisible3] = useState(true);
  const [visible4, setVisible4] = useState(true);
  const [visible5, setVisible5] = useState(true); 

  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if (user) {
        values.id = user.id;
      }
      onSaveUser(values); 
    }).catch(info => {
      setMessage('Please complete the fields');
      setShowError(true);     
      console.log('Validate Failed:', info);
         
    });
  };
  useImperativeHandle(ref, () => ({
    resetForm() {
        form.resetFields();
    }
}));

useEffect(() => {
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    user.as_of = null;
    form.setFieldsValue(user); // Prepopulate form fields if editing
  } else {
    form.resetFields(); // Clear form for adding a new user
  }
}, [user, form]);

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

  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: `Import ${type}s`,
      key: '1',
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
       title={`${user ? 'Edit' : 'Add'} ${type}`}
        size='medium'
        width={400}
        onClose={onUserClose}
        onCancel={onUserClose}
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
        <Button onClick={handleSave} type="primary">
              Save Details
            </Button>
            <Button onClick={onUserClose}>Cancel</Button>
          
          </Space>
        </Col>
      </Row>
          </div>
        }
      >
      
  <Form form={form} layout="" {...layout}>
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
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'First Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="middle_name" label="Middle Name">
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={6}>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Last Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>            
              <Col span={3}>
              <Form.Item name="suffix" label="Suffix">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="display_name" label="Display Name" rules={[{ required: true, message: 'Enter Display Name', },]}>
                   <Input placeholder="Enter Display Name" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="company_name" label="Company Name">
                   <Input placeholder="Enter Company Name" /> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter Email', },{type: "email",message: "Please enter a valid email address!", },]}>
                   <Input placeholder="Enter Email" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="phone_number" label="Phone number">
                   <Input placeholder="Enter Phone number" /> 
              </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="mobile_number" label="Mobile number" rules={[{ required: true, message: 'Enter Mobile number', },]}>
                   <Input placeholder="Enter Mobile number" /> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="fax" label="Fax">
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
              <Form.Item name="address1" label="Street address 1">
                   <Input placeholder="Enter Street address 1"/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="address2" label="Street address 2">
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
                   <Input placeholder="Enter Postal code"/> 
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
        <h3 className="h3 gx-text-capitalize gx-mb-0"><EditOutlined /> Notes</h3> 
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
           
           </Row>
         )}
      </Widget>
{type === "customer" && (
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
    >
      <Select mode="single" placeholder="Please select terms">
        <Option value="Net15">Net15</Option>
        <Option value="Net30">Net30</Option>
        <Option value="Net60">Net60</Option>
      </Select>
    </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item
      name="delivery_option"
      label="Sales form delivery options"      
    >
      <Select mode="single" placeholder="Use company default">
      <Option value="None">None</Option>
        <Option value="Use company default">Use company default</Option>
        <Option value="Send later">Send later</Option>
        <Option value="Print later">Print later</Option>        
      </Select>
    </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item
      name="language"
      label="Language to use when send invoice"      
    >
      <Select mode="single" placeholder="Use company default">
      <Option value="English">English</Option>      
      </Select>
    </Form.Item>
              </Col>
              </Row>            

         )}              
              </Widget>
)}
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
{ type === "customer"?
<Row gutter={16}>           
            <Col span={24}>
              <Form.Item name="tax_number" label="Vat Registration Number">
                   <Input placeholder="Enter Vat Registration Number"/> 
              </Form.Item>
              </Col>
              </Row>
              :
              <>
<Row gutter={16}>           
            <Col span={24}>
              <Form.Item name="business_number" label="Business ID Number / Social Security Number">
                   <Input/> 
              </Form.Item>
              </Col>
              </Row>

              <h3 className="h3 gx-text-capitalize gx-mb-0">Expense Rates</h3> <br/>
              <h3 className="h4 gx-text-capitalize gx-mb-0">Payments</h3> 

              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="supplier_terms" label="Terms">
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
              <Select mode="single">
      <Option>Select</Option>
        <Option value="Amortisation expense">Amortisation expense</Option>
        <Option value="Bad debts">Bad debts</Option>
        <Option value="Bank Charges">Bank Charges</Option>    
        <Option value="Commissions and fees">Commissions and fees</Option> 
        <Option value="Equipment rental">Equipment rental</Option> 
        <Option value="Income tax expense">Income tax expense</Option> 
        <Option value="Insurance liability">Insurance liability</Option>     
      </Select>
              </Form.Item>
              </Col>
              </Row>
              </>
}
              <Row gutter={16}>           
            <Col span={12}>
              <Form.Item name="opening_balance" label="Opening Balance" initialValue={0}>
                   <Input/> 
              </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item name="as_of" label="As of">
              <DatePicker /> 
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
});
export default AddCustomer;