import React from "react";
import {Modal,Select} from "antd";
const {Option} = Select;

const AddClaimDoctor = ({isOpen,handleOk,handleCancel}) =>
{    
    return (
      <Modal visible={isOpen}
             title="Select Claim Doctor"
             closable={false} 
             onOk={handleOk}
             onCancel={handleCancel}              
             style={{zIndex: 2600}}>
        <div className="gx-form-group">       
        <Select placeholder="Please Select Doctor" style={{width:'100%'}}>
                  <Option value="xiao">Doctor 1</Option>
                  <Option value="mao">Doctor 2</Option>
                </Select>
        </div>      
      </Modal>
    );
  }
export default AddClaimDoctor;
