import React, { useState, useEffect } from 'react';
import { Button, Col, Upload, Form, Input, Row, Alert } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import Toast from "components/AppNotification/toast.js";


const Profile = () => {
  const [loadings, setLoadings] = useState([]);
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [user, setUser] = useState(false);
  const [uploadname, setUploadName] = useState(null);
  

  const [form] = Form.useForm();

  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };

  const handleSave = () => {
    form.validateFields().then(values => {      
      onSaveUser(values); 
    }).catch(info => {
      setMessage('Please complete the fields');
      setShowError(true);     
      console.log('Validate Failed:', info);         
    });
  };

  const handleUpload = (info) => {
    const { file } = info;
    if (file && file.name) {     
      setUploadName(file.name);
    } else {
      setMessage('Error in uploading image');
      setShowError(true); 
    }
  };
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    
    try {
      
      const first_name = userData.first_name;
      const last_name = userData.last_name;
      const email = userData.email;
      const contact_number = userData.contact_number;
      const company_name = userData.company_name;
      const password = userData.password;
      const logo = uploadname;
       
        const employeeData = {first_name, last_name,email, contact_number, company_name, password,logo};
        let result = await window.electronAPI.updateUser(employeeData);   
            console.log(result.message);
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Profile saved successfully!');
        fetchUser();
      
      } else {
        setMessage('Failed to save profile. Please try again.');
        setShowError(true);
      }
    } catch (error) {
      setIsSuccess(false);      
      setMessage('An error occurred. Please try again later.');
      setShowError(true);
    }
    
  };
  
    const fetchUser = async () => {
        try {
            const response = await window.electronAPI.getAllUsers(); 
            console.log(response);         
            const user = response[0];
            form.setFieldsValue(
              {
                ...user,
                logo: null,
              });
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
          setMessage(`Error fetching user: ${errorMessage}`);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchUser();
  }, []);


  
  return (
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Profile</h2>
   } 
   
   >  
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
  <Row gutter={[16, 16]}>
          
       <Col xs={24} sm={24} md={24}>
       <Form form={form} layout="" {...layout}>
  
           
          <Row gutter={2}> 
              <Col span={12}>
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'Enter First Name', },]}>
                   <Input/> 
              </Form.Item>
              </Col>            
                        
              <Col span={12}>
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
              <Form.Item name="contact_number" label="Contact Number" rules={[{ required: true, message: 'Enter Contact Number', },]}>
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="company_name" label="Company Name">
                   <Input/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="password" label="Password" rules={[
            { required: true, message: 'Enter Password' },
            { min: 6, message: 'Password must be at least 6 characters long' },
          ]}>
                   <Input.Password placeholder='Enter password'/> 
              </Form.Item>
              </Col>
              <Col span={12}>
        <Form.Item
          name="logo"
          label="Logo"
          valuePropName="fileList"
          getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
        >
          <Upload
            name="logo"
            listType="picture"
            accept=".png,.jpg,.jpeg" // Acceptable file types
            maxCount={1} // Restrict to one file
            beforeUpload={() => false} // Prevent auto-upload
            onChange={handleUpload}
          >
            <Button icon={<UploadOutlined />}>Click to Upload</Button>
          </Upload>
        </Form.Item>
      </Col>
              </Row>    

              </Form>  
              <Button onClick={handleSave} type="primary">
              Save Details
            </Button>   
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default Profile;
