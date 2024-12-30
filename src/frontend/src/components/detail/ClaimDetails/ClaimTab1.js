import React,{useState} from "react";

import { Col,Row,Alert } from "antd";
import AddClaim from "components/Drawers/AddClaim";
import MakePayment from "./MakePayment";

const ClaimTab1 = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toggleModal = () => {
    setIsModalOpen(true);
  };
  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };
  return (
    <>
  <Row>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">ICD10 Code</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">RJ45.0</p>
                      <AddClaim title="Edit Claim" icon="edit"/> 
                      </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Overal Amount</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">R234.90</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Owner</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">Tendai</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
             <Alert message="Waiting" type="warning" showIcon banner/>  
             <span className="gx-text-primary gx-pointer" onClick={()=>toggleModal()}><i className="icon icon-card gx-fs-sm gx-mr-2"/>Make Payment</span>            
              </Col>
            </Row>
            <MakePayment isOpen={isModalOpen} handleCancel={handleCancel} handleOk={handleOk}/> 
            </>
  );
}

export default ClaimTab1;