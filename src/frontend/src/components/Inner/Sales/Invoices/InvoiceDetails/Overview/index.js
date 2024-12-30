import React, {useContext} from "react";
import {Col, Row, Select, Alert, Typography, Space, Button} from "antd";
import { UserOutlined, FileOutlined } from "@ant-design/icons";
import Widget from "components/Widget";
import {TypeContext} from "appContext/TypeContext.js";


const Option = Select.Option;
const { Text } = Typography;

const Overview = ({detail, handleConvert}) => {
  const type = useContext(TypeContext);


    return (
      <Widget 
      title={
        
       <h3 className="gx-ml-3">{type}</h3>
    } 
    extra = {
      <>
      
{detail?.status === 'Pending' && type === 'Quote' && 
  <Row>
       <Col xs={12} sm={12} md={12}>
       <Button type="danger" onClick={handleConvert} danger>Convert to Invoice</Button>
      
      </Col>
      </Row>
    }
    
      <Col xs={24} sm={24} md={24}>
      <Alert  className="gx-mr-3" message={detail?.status} type={
        detail?.status === 'Paid' || detail?.status === 'Invoiced'
      ? 'success'
      : detail?.status === 'Rejected'
      ? 'error'
      : detail?.status === 'Pending'
      ? 'warning'
      : 'info'
      } showIcon banner/>
      </Col>
      </>
    }
      styleName="gx-card-tabs gx-card-profile"
      >
        <div className="gx-mb-4"></div>
        <Row>
        <Col xs={24} sm={12} md={12}>
          <Space>
      <FileOutlined style={{ fontSize: "22px" }} />
      <Text style={{ fontSize: "20px" }}>{detail?.number} </Text>
    </Space>
          </Col>
          <Col xs={24} sm={12} md={12}  style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
      <UserOutlined style={{ fontSize: "22px" }} />
      <Text style={{ fontSize: "20px" }}>{detail?.first_name} {detail?.last_name}</Text>
    </Space>
          </Col>
        </Row>
        <hr/>
         <Row>
        
         <Col xs={24} sm={8} md={8}>
         <h2 className="h2 gx-text-grey gx-mb-10">Phone</h2> 
         <h3 className="h4 gx-mb-10">{detail?.phone_number}</h3> 
         </Col>
         <Col xs={24} sm={8} md={8}>
         <h2 className="h2 gx-text-grey gx-mb-10">Mobile</h2> 
         <h3 className="h4 gx-mb-10">{detail?.mobile_number}</h3> 
         </Col>
         <Col xs={24} sm={8} md={8}>
         <h2 className="h2 gx-text-grey gx-mb-10">Billing address</h2> 
         <h3 className="h4 gx-mb-10">{detail?.billing_address}</h3> 
         </Col>
         </Row>
      </Widget>
    );
}


export default Overview;
