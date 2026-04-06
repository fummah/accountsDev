import React, { forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import moment from 'moment';
import { Button, Col, Drawer, Form, Input, Row, Space, Dropdown, DatePicker, Select, Checkbox, Modal, Divider, message } from 'antd';
import { DownOutlined, IdcardOutlined, PlusOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

const { Option } = Select;

const AddEmployee = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, employee }, ref) => {
  
  const [form] = Form.useForm();
  const [deptForm] = Form.useForm();
  const [departments, setDepartments] = useState([]);
  const [deptModalVisible, setDeptModalVisible] = useState(false);

  const loadDepartments = async () => {
    try {
      const res = await window.electronAPI?.listDepartments?.();
      setDepartments(Array.isArray(res) ? res : []);
    } catch { setDepartments([]); }
  };

  useEffect(() => { loadDepartments(); }, []);

  const handleAddDepartment = async () => {
    try {
      const vals = await deptForm.validateFields();
      const res = await window.electronAPI?.createDepartment?.(vals);
      if (res?.success) {
        message.success('Department added');
        setDeptModalVisible(false);
        deptForm.resetFields();
        loadDepartments();
      } else {
        message.error(res?.error || 'Failed to add department');
      }
    } catch {}
  };

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
    // Ensure date fields and array fields are converted to the types AntD components expect
    const vals = {
      ...employee,
      date_hired: employee.date_hired ? moment(employee.date_hired) : null,
      permissions: Array.isArray(employee.permissions) ? employee.permissions : (employee.permissions ? JSON.parse(employee.permissions) : [])
    };
    form.setFieldsValue(vals); // Prepopulate form fields if editing
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
        placement="top"
        height="100%"
        onClose={onUserClose}
        open={open}
        destroyOnClose={true}
        bodyStyle={{ paddingBottom: 80 }}
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
      
  <Form form={form} layout="" {...layout} initialValues={{
    status: 'Active',
  }}>
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
              <Col span={8}>
              <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Enter Email Address', },{type: "email",message: "Please enter a valid email address!", },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item name="phone" label="Phone Number" rules={[{ required: true, message: 'Enter Phone Number', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item name="address" label="Physical Address" rules={[{ required: true, message: 'Enter Physical Address', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
        <Col span={8}>
        <Form.Item name="date_hired" label="Hire Date" rules={[{ required: true, message: 'Enter hire date', },]}>
          <DatePicker/> 
        </Form.Item>
        </Col>
              <Col span={8}>
              <Form.Item name="salary" label="Salary" rules={[{ required: true, message: 'Enter Salary', },{message: "Please enter a valid salary!", },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item name="department" label="Department">
                <Select
                  showSearch
                  optionFilterProp="children"
                  placeholder="Select department"
                  dropdownRender={menu => (
                    <div>
                      {menu}
                      <Divider style={{ margin: '4px 0' }} />
                      <div style={{ padding: '4px 8px' }}>
                        <Button type="link" icon={<PlusOutlined />} onClick={() => setDeptModalVisible(true)} block>
                          Add Department
                        </Button>
                      </div>
                    </div>
                  )}
                >
                  {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
                </Select>
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true, message: 'Please select status', },]}> 
<Select placeholder="Please select status">
<Option value="Active">Active</Option>
<Option value="Inactive">Inactive</Option>
<Option value="On Leave">On Leave</Option>
</Select>
</Form.Item>
              </Col>

               {/* New Role Field */}
              <Col span={12}>
                <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Select a role' }]}> 
                  <Select placeholder="Select Role">
                    <Option value="Admin">Admin</Option>
                    <Option value="Manager">Manager</Option>
                    <Option value="Staff">Staff</Option>
                  </Select>
                </Form.Item>
              </Col>

              {/* New Permissions Field */}
              <Col span={24}>
                <Form.Item name="permissions" label="Permissions">
                  <Checkbox.Group>
                    <Row>
                      <Col span={8}><Checkbox value="view">View</Checkbox></Col>
                      <Col span={8}><Checkbox value="edit">Edit</Checkbox></Col>
                      <Col span={8}><Checkbox value="delete">Delete</Checkbox></Col>
                    </Row>
                  </Checkbox.Group>
                </Form.Item>
              </Col>
              </Row>            
              
              </Widget>

              </Form>        
      </Drawer>

      <Modal
        title="Add Department"
        visible={deptModalVisible}
        onOk={handleAddDepartment}
        onCancel={() => { setDeptModalVisible(false); deptForm.resetFields(); }}
        okText="Add"
        destroyOnClose
      >
        <Form form={deptForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Department Name" rules={[{ required: true, message: 'Enter department name' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Department Code">
            <Input placeholder="Optional code" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
});
export default AddEmployee;