import React, { useState } from 'react';
import { Button, Col, DatePicker, Drawer, Form, Input, Row, Space,Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const AddDocument = ({title,icon,txt='primary'}) => {
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
            <Col span={24}>
            <Form.Item label="Upload Files">
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
              Save Files
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
export default AddDocument;