import React from "react";
import {Modal,Button} from "antd";

const MakePayment = ({isOpen,handleOk,handleCancel}) =>
{    
    return (
      <Modal visible={isOpen}
             title="Make Payment"
             closable={false} 
             onOk={handleOk}
             onCancel={handleCancel}              
             style={{zIndex: 2600}}>
        <div className="gx-form-group">       
        <Button type="primary">Make Payment</Button>
        </div>      
      </Modal>
    );
  }
export default MakePayment;
