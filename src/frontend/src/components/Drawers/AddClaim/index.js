import React, { useState } from 'react';
import { Button, Col, DatePicker, Drawer, Form, Input, Row, Space,Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const AddClaim = ({title,icon,txt='primary'}) => {
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
       <p className={`gx-text-${txt} gx-mb-0 gx-mr-2 gx-pointer gx-d-none gx-d-sm-block`} onClick={showDrawer}>
       <i className={`icon icon-${icon} gx-fs-lg gx-d-inline-flex gx-vertical-align-middle`} /> {title}
       </p>
     
      <Drawer
        title={`${title} For : Brown A.`}
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
                name="service_date"
                label="Service Date"
                rules={[
                  {
                    required: true,
                    message: 'Service Date',
                  },
                ]}
              >
                <DatePicker style={{ width: '100%', }}/>  
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="incident_start_date"
                label="Start Incident Date"
                rules={[
                  {
                    required: true,
                    message: 'Enter Start Incident Date',
                  },
                ]}
              >               
                   <DatePicker style={{ width: '100%', }}/>               
              </Form.Item>
            </Col>          
         
            <Col span={8}>
              <Form.Item
                name="incident_end_date"
                label="End Incident Date"
                rules={[
                  {
                    required: true,
                    message: 'Enter End Incident Date',
                  },
                ]}
              >               
                  <DatePicker style={{ width: '100%', }}/>              
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
          <Col span={8}>
              <Form.Item
                name="amount"
                label="Amount"
                rules={[
                  {
                    required: true,
                    message: 'Enter Amount',
                  },
                ]}
              >               
                  <Input placeholder="Enter Amount" />              
              </Form.Item>
            </Col>
            
            </Row>
            <Row gutter={16}>
            <Col span={24}>
            <Form.Item label="Upload Claim Files">
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
export default AddClaim;