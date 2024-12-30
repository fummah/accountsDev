import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Drawer, Form, Input, Row, Space,Dropdown, DatePicker } from 'antd';
import { DownOutlined,IdcardOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

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
      label: `Import Vat`,
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
        New Vat
      </Dropdown.Button>
       </p>
     
      <Drawer
        title={`${vat ? 'Edit' : 'Add'} Vat`}
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
  <Widget>
          <Row gutter={2}> 
              <Col span={8}>
              <Form.Item name="vat_name" label="Vat Name" rules={[{ required: true, message: 'Enter Vat Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>             
              <Col span={8}>
              <Form.Item name="vat_percentage" label="Vat Percentage" rules={[{ required: true, message: 'Enter Vat Percentage', },]}>
                   <Input/> 
              </Form.Item>
              </Col>            
             
              </Row>            
              
              </Widget>

              </Form>        
      </Drawer>
    </>
  );
});
export default AddVat;