import React from "react";

import { Col,Row } from "antd";

const ClaimTab3 = () => {
  return (
  
      <Row>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Entered By</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">Tendai</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Claim Type</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">Test</p>
              </Col>
            
              
            </Row>
     
  );
}

export default ClaimTab3;