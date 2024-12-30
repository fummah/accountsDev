import React, {useContext} from "react";
import { Row, Col, Typography, Divider } from "antd";
import {CategoryContext} from "appContext/TypeContext.js";

const { Text } = Typography;

const CustomerInfo = ({detail}) => {
  const type = useContext(CategoryContext);
  return (
    <Row gutter={[16, 16]}>
      {/* Contact Info Section */}
      <Col span={12}>
        <Text strong>Contact Details</Text>
        <Divider />
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Fax: </Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.fax}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Website:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.website}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Others:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.other}</Text>
          </Col>
        </Row>
      </Col>
      <Col span={12}>
        <Text strong>Additional Info</Text>
        <Divider />
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Payment Method:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.payment_method}</Text>
          </Col>
        </Row>
        
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">{type} Language:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.language}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">{type} Sales Tax Number:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.tax_number}</Text> 
          </Col>
        </Row>
        
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">As of:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.as_of}</Text> 
          </Col>
        </Row>
        {type === "Customer"?(
          <>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Terms:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.terms}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Preferred Delivery Method:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.delivery_option}</Text>
          </Col>
        </Row>
        </>
        ):(
        <>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Business ID Number / Social Security Number:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.business_number}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Terms:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.supplier_terms}</Text>
          </Col>
        </Row>
        <Divider/>
        <Row>
          <Col span={8}>
            <Text className="gx-text-grey">Account Number:</Text>
          </Col>
          <Col span={16}>
            <Text>{detail?.account_number}</Text>
          </Col>
        </Row>
        </>
  )
}        
      </Col>
    </Row>
  );
};

export default CustomerInfo;
