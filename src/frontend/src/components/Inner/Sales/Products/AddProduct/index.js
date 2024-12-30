import React, { useState,forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space,Dropdown, Checkbox } from 'antd';
import { DownOutlined,IdcardOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

const { Option } = Select;
const { TextArea } = Input;

const AddProduct = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, product }, ref) => {
 
  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if (product) {
        values.id = product.id;
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
  if (product) {
    form.setFieldsValue(product); // Prepopulate form fields if editing
  } else {
    form.resetFields(); // Clear form for adding a new product
  }
}, [product, form]);

  const [incomeAccount, setIncomeAccount] = useState([
    { label: 'Accrued liabilities', value: 'Accrued liabilities' },
    { label: 'Cash and cash equivalents', value: 'Cash and cash equivalents' },
    { label: 'Allowance for bad debt', value: 'Allowance for bad debt' },
    { label: 'Available for sale assets (short-term)', value: 'Available for sale assets (short-term)' },
    { label: 'Prepaid expenses', value: 'Prepaid expenses' },
    { label: 'Stock', value: 'Stock' },
    { label: 'Stock Asset', value: 'Stock Asset' },
    { label: 'Uncategorised Asset', value: 'Uncategorised Asset' },
    { label: 'Undeposited Funds', value: 'Undeposited Funds' },
  ]);

  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: 'Import product / service',
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
        New Product / Service
      </Dropdown.Button>
       </p>
     
      <Drawer
        title='Product/Service information'
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
      >
        <Row gutter={2}>
        <Col span={24}>
     <Form.Item name="type" label="Select Type" rules={[{ required: true, message: 'Please select type', },]}> 
<Select mode="single" placeholder="Please select type">
<Option value="Product">Product</Option>
<Option value="Service">Service</Option>
</Select>
</Form.Item>
     </Col>
        </Row>

          <Row gutter={2}>           
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter name', },]}>
                   <Input placeholder="Enter name"/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="sku" label="SKU" rules={[{ required: true, message: 'Enter SKU', },]}>
                   <Input placeholder="Enter SKU"/> 
              </Form.Item>
              </Col>
              <Col span={24}>
              <Form.Item name="category" label="Category">
              <Select mode="single" placeholder="Enter category">
<Option value="Internal">Internal</Option>
<Option value="External">External</Option>
</Select>
              </Form.Item>
              </Col>
                      
              <Col span={24}>
              <Form.Item name="description" label="Description">
              <TextArea rows={4} placeholder="Enter description"/> 
              </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item name="price" label="Sales price/rate">
              <Input placeholder="Enter sales price / rate"/>
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="income_account" label="Income Account" rules={[{ required: true, message: 'Select Income Account', },]}>
              <Select placeholder="Select Income account">       
      {incomeAccount.map((income) => (
        <Option key={income.value} value={income.value}>
          {income.label}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="tax_inclusive">
              <span className='h5 gx-mb-0'><Checkbox> Inclusive of tax</Checkbox> </span>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="tax" label="Tax">
              <Input/>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="isfromsupplier" label="Purchasing information">
              <span className='h5 gx-mb-0'><Checkbox> I purchase this product/service from a supplier.</Checkbox> </span>
              </Form.Item>
              </Col>
              </Row>

              </Widget>
              </Form>
        
      </Drawer>
    </>
  );
});
export default AddProduct;