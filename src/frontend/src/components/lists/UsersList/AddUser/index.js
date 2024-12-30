import React, { useState } from "react";
import { Row, Col, Form, Input, Modal, Select,Alert } from "antd";
import IntlMessages from "util/IntlMessages";
import Widget from "components/Widget/index";

const { Option } = Select;

const AddUser = ({ onSaveUser, onUserClose, open, user }) => {
  const initialState = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    mi: user.mi,
    date_hired: user.date_hired,
    entered_by: user.entered_by, 
    selected: user.selected,
    starred: user.starred,
    frequently: user.frequently,
  };
  const [userData, setUserData] = useState(initialState);
  const [first_name, setFirstName] = useState('');
  const [last_name, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mi, setMi] = useState('');
  const [date_hired, setDateHired] = useState('');
  const [entered_by, setEnteredBy] = useState('1');
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await window.electronAPI.insertEmployee(first_name, last_name, mi, email, date_hired, entered_by);   
      setIsSuccess(result.success);
      if (result.success) {
        setMessage('Employee added successfully!');
      } else {
        setMessage('Failed to add employee. Please try again.');
      }
    } catch (error) {
      setIsSuccess(false);
      setMessage('An error occurred. Please try again later.');
    }
    setFirstName('');
    setEmail('');
    setLastName('');
    setMi('');
    setDateHired('');
    setEnteredBy('');
  };


  
  return (
    <Modal
      title={
        userData.first_name === ""
          ? <IntlMessages id="contact.addContact" />
          : <IntlMessages id="contact.saveContact" />
      }
      visible={open}
      onOk={handleSubmit}
      onCancel={onUserClose}
      closable={false}
    >
      <Widget>
        {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
        <Row gutter={16}>
          <Col span={9}>
            <Form.Item name="first_name" label="First Name">
              <Input
                placeholder="Enter First Name"
                value={first_name}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Form.Item>
          </Col>
          <Col span={1}></Col>
          <Col span={4}>
            <Form.Item name="mi" label="M.I">
              <Input
                placeholder="Enter M.I"
                value={mi}
                onChange={(e) => setMi(e.target.value)}
              />
            </Form.Item>
          </Col>
          <Col span={1}></Col>
          <Col span={9}>
            <Form.Item name="last_name" label="Last Name">
              <Input
                placeholder="Enter Last Name"
                value={last_name}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="email" label="Email Address">
              <Input
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="hire_date" label="Hire Date">
              <Input
                placeholder="Enter Hire date"
                value={date_hired}
                onChange={(e) => setDateHired(e.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
      </Widget>
    </Modal>
  );
};

export default AddUser;
