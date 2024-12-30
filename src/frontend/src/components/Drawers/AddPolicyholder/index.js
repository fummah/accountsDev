import React, { useState } from 'react';
import { Button, Col, DatePicker, Drawer, Form, Input, Row, Select, Space,Typography } from 'antd';
const { Option } = Select;
const { Title } = Typography;

const AddPolicyholder = ({title,icon,txt='primary'}) => {
  const [open, setOpen] = useState(false);
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
  return (

    <>
       <p className={`gx-text-${txt} gx-mb-0 gx-pointer gx-d-none gx-d-sm-block`} onClick={showDrawer}>
       <i className={`icon icon-${icon} gx-fs-lg gx-d-inline-flex gx-vertical-align-middle`} /> {title}
       </p>
     
      <Drawer
        title={title}
        size='large'
        width='100%'
        onClose={onClose}
        open={open}
        styles={{
          body: {
            paddingBottom: 80,
          },
        }}
       
      >
     
        <Form layout="" {...layout}>
          <Row gutter={16}>           
            <Col span={8}>
              <Form.Item
                name="first_name"
                label="Fist Name"
                rules={[
                  {
                    required: true,
                    message: 'Enter First Name',
                  },
                ]}
              >
                <Input placeholder="Enter First Name" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="last_name"
                label="Last Name"
                rules={[
                  {
                    required: true,
                    message: 'Enter First Name',
                  },
                ]}
              >               
                  <Input placeholder="Enter First Name" />              
              </Form.Item>
            </Col>          
         
            <Col span={8}>
              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  {
                    required: true,
                    message: 'Enter Email Address',
                  },
                ]}
              >               
                  <Input placeholder="Enter Email Address" />              
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
          <Col span={8}>
              <Form.Item
                name="id_number"
                label="ID Number"
                rules={[
                  {
                    required: true,
                    message: 'Enter ID Number',
                  },
                ]}
              >               
                  <Input placeholder="Enter ID Number" />              
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="dob"
                label="Date of Birth"
                rules={[
                  {
                    required: true,
                    message: 'Enter Date of Birth',
                  },
                ]}
              >               
                  <DatePicker style={{
                    width: '100%',
                  }}/>              
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="product"
                label="Product Name"
                rules={[
                  {
                    required: true,
                    message: 'Please enter product',
                  },
                ]}
              >
                <Select placeholder="Please select product">
                  <Option value="xiao">Product A</Option>
                  <Option value="mao">Product B</Option>
                </Select>
              </Form.Item>
            </Col>
            </Row>
            <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="medical_scheme"
                label="Medical Scheme Name"
                rules={[
                  {
                    required: true,
                    message: 'Please enter Medical Scheme',
                  },
                ]}
              >
                <Select placeholder="Please select Medical Scheme">
                  <Option value="xiao">Discovery</Option>
                  <Option value="mao">Gems</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="scheme_option"
                label="Scheme Option"
                rules={[
                  {
                    required: true,
                    message: 'Enter Scheme Option',
                  },
                ]}
              >               
                  <Input placeholder="Enter Scheme Option" />              
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="scheme_number"
                label="Scheme Number"
                rules={[
                  {
                    required: true,
                    message: 'Enter Scheme Number',
                  },
                ]}
              >               
                  <Input placeholder="Enter Scheme Number" />              
              </Form.Item>
            </Col>
            
          </Row>
          <Title level={4}>Bank Information</Title>
          <Row gutter={16}>
          <Col span={8}>
              <Form.Item
                name="bank_name"
                label="Bank Name"
                rules={[
                  {
                    required: true,
                    message: 'Please choose Bank Name',
                  },
                ]}
              >
                <Select placeholder="Please Bank Name">
                  <Option value="private">Nedbank</Option>
                  <Option value="public">ABSA</Option>
                </Select>
              </Form.Item>
            </Col>
          <Col span={8}>
              <Form.Item
                name="bank_code"
                label="Bank Code"
                rules={[
                  {
                    required: true,
                    message: 'Enter Bank Code',
                  },
                ]}
              >               
                  <Input placeholder="Enter Bank Code" />              
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="account_number"
                label="Account Number"
                rules={[
                  {
                    required: true,
                    message: 'Enter Account Number',
                  },
                ]}
              >               
                  <Input placeholder="Enter Account Number" />              
              </Form.Item>
            </Col>
          </Row>
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
        </Form>
      </Drawer>
    </>
  );
};
export default AddPolicyholder;