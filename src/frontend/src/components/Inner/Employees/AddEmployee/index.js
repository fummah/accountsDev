import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Drawer, Form, Input, Row, Space,Dropdown, DatePicker } from 'antd';
import { DownOutlined,IdcardOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

const AddEmployee = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, employee }, ref) => {
  
  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if (employee) {
        values.id = employee.id;
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
  if (employee) {
    form.setFieldsValue(employee); // Prepopulate form fields if editing
  } else {
    form.resetFields(); // Clear form for adding a new employee
  }
}, [employee, form]);



  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: `Import Employee`,
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
        New Employee
      </Dropdown.Button>
       </p>
     
      <Drawer
        title={`${employee ? 'Edit' : 'Add'} Employee`}
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
        <h3 className="h3 gx-text-capitalize gx-mb-0"><IdcardOutlined /> {employee ? 'Edit' : 'Add'} Employee</h3> 
      }
      
      >
          <Row gutter={2}> 
              <Col span={8}>
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'Enter First Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>             
              <Col span={8}>
              <Form.Item name="mi" label="M.I">
                   <Input/> 
              </Form.Item>
              </Col>            
              <Col span={8}>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Enter Last Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Enter Email Address', },{type: "email",message: "Please enter a valid email address!", },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item ame="hire_date" label="Hire Date" rules={[{ required: true, message: 'Enter hire date', },]}>
                   <DatePicker/> 
              </Form.Item>
              </Col>
              </Row>            
              
              </Widget>

              </Form>        
      </Drawer>
    </>
  );
});
export default AddEmployee;