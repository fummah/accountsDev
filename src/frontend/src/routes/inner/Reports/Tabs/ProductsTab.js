import React from "react";
import {Col, Row} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";

const ProductsTab = () => {
  return (
    <Auxiliary> 
       <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Products and Services</h2>
      } >  
      <Row>
      <Col span={24}>
 
        </Col>
              
      </Row><hr/>
      
      </Widget>
    </Auxiliary>
  );
};

export default ProductsTab;
