import React, { useState } from 'react';
import { Drawer, Form, Select, Button,Typography,Input } from 'antd';
import CustomScrollbars from "util/CustomScrollbars";
const { Option } = Select;
const { Title } = Typography;

const AddNote = ({title,icon,txt='primary'}) => {
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
        title="Notes"
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
     
     <div className="gx-chat-sidenav-main">
      <div class="gx-chat-item">
        <div class="gx-bubble-block">
          <div class="gx-bubble" style={{width:'100%',backgroundColor: '#e6faff'}}>
          <div class="gx-message" >This is the first test</div>
      <div class="gx-time gx-text-muted gx-text-right gx-mt-2">3:05:47 PM</div>
      </div>
      </div>
      </div>
      <div class="gx-chat-item">
        <div class="gx-bubble-block">
          <div class="gx-bubble" style={{width:'100%'}}>
          <div class="gx-message" >This is the first test</div>
      <div class="gx-time gx-text-muted gx-text-right gx-mt-2">3:05:47 PM</div>
      </div>
      </div>
      </div>
    
      <div className="gx-chat-sidenav-content">

        <CustomScrollbars className="gx-chat-sidenav-scroll">
          <div className="gx-p-4">
          <Form layout="" {...layout}>
          <Form.Item
      label="Type your Notes"
      name="TextArea"
      rules={[{ required: true, message: 'Please input!' }]}
    >
      <Input.TextArea />
    </Form.Item>
    <Button type="primary">
           Add Notes
            </Button>
            <Button onClick={onClose}>Cancel</Button>
    </Form>
          </div>
        </CustomScrollbars>

      </div>
    </div>
      </Drawer>
    </>
  );
};
export default AddNote;