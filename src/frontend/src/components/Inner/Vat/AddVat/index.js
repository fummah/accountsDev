import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import { Col, Form, Input, Modal, Row, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';

const AddVat = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, vat }, ref) => {
  
  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if(vat)
      {
        values.id = vat.id;
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
  if (vat) {    
    form.setFieldsValue(vat); // Prepopulate form fields if editing
  } else {
    form.resetFields(); // Clear form for adding a new vat
  }
}, [vat, form]);



  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: `Import Tax Rate`,
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
        New Tax Rate
      </Dropdown.Button>
       </p>
     
<Modal
        title={`${vat ? 'Edit' : 'Add'} Tax Rate`}
        open={open}
        width={720}
        centered
        onOk={handleSave}
        onCancel={onUserClose}
        okText="Save Details"
        cancelText="Cancel"
        destroyOnClose
      >
        <Form form={form} {...layout}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="vat_name" label="Tax Name" rules={[{ required: true, message: 'Enter Tax Name' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vat_percentage" label="Tax Percentage" rules={[{ required: true, message: 'Enter Tax Percentage' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
});
export default AddVat;