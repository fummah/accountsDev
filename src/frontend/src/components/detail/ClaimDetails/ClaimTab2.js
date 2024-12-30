import React from "react";

import { Col,Row } from "antd";

const ClaimTab2 = () => {
  return (
   
      <Row>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Service Date</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">2023-09-09</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Start Date</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">2023-09-09</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">End Date</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">2023-09-09</p>
              </Col>
              <Col xl={6} lg={24} md={24} sm={12} xs={24}>
              <div className="col-auto ">
                      <div className="last-message-time">Date Entered</div>              
                    </div>
                      <p className="last-message text-truncate gx-text-muted">2023-09-09 10:10:10</p>
              </Col>
            </Row>
     
  );
}

export default ClaimTab2;