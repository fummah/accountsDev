import React, {useContext} from "react";
import { Card, Row, Col, Typography, Button } from "antd";
import { PrinterOutlined } from '@ant-design/icons';
import DetailItem from "./DetailItem";
import {CategoryContext} from "appContext/TypeContext.js";

const { Text, Title } = Typography;



const CustomerHeader = ({detail}) => {
  const type = useContext(CategoryContext);
  const header = [
    { id: 1, title: 'Email', icon: 'email', desc: [<span className="gx-link" key={1}>{detail?.email}</span>] },
    { id: 2, title: 'Phone Number', icon: 'phone', desc: [`${detail?.phone_number}`]},
    { id: 3, title: 'Mobile Number', icon: 'megaphone', desc: [`${detail?.mobile_number}`] },
    { id: 4, title: 'Company Name',  icon: 'home', userList: '', desc: [`${detail?.company_name}`] },
    { id: 5, title: 'Billing Address', icon: 'location', userList: '', desc: [`${detail?.address1} ${detail?.city} ${detail?.state} ${detail?.postal_code} ${detail?.country}`] },
    { id: 6, title: 'Notes', icon: 'chat', userList: '',  desc: [`${detail?.notes}`] },
  ];
  const open_balance =    new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", 
    minimumFractionDigits: 2,
     maximumFractionDigits: 2,
  }).format(detail?.opening_balance);

  const due_amount =    new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", 
    minimumFractionDigits: 2,
     maximumFractionDigits: 2,
  }).format(detail?.due_amount?.due_amount || 0);
  return (
    <Card>
      <div
       style={{
        display: "flex",
        justifyContent: "space-between"
       }}
      >
      <Title level={4}>{detail?.title} {detail?.first_name} {detail?.last_name}</Title>
      <p className="gx-text-primary gx-mb-0 gx-pointer gx-d-none gx-d-sm-block">
      <PrinterOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={() => window.print()} />
        </p>
      </div>
      <Row>   
      <Col span={18}>  
      <Row>    
        {header.map((det, index) =>
                  <Col key={index} xl={8} lg={12} md={12} sm={12} xs={24}>
                    <DetailItem data={det}/>
                  </Col>
                )}
       </Row>
       </Col>
        <Col span={6} style={{ textAlign: "right" }}>
        <Card>
          <div style={{ marginBottom: "8px" }}>
            <Text type="secondary">Open Balance</Text>
            <Title level={3} style={{marginTop: 0 }}>
              {open_balance}
            </Title>
          </div>
          <div>
            <Text type="secondary">Overdue Payment</Text>
            <Title level={3} style={{ color: "#ff4d4f", margin: 0 }}>
              {due_amount}
            </Title>
          </div>
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default CustomerHeader;
