import React from "react";
import {Link} from "react-router-dom";
import { Card, Row, Col, Typography, Button, Space } from "antd";
import {
  UserAddOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  DollarCircleOutlined,
  FundOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

const featureCards = [
  {
    title: "Customer Center",
    description: "View and manage all customer details.",
    icon: <UserAddOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "Go to Customers",
    path: "/inner/customersleads",
    typ:"",
  },
  {
    title: "Create Quotes",
    description: "Generate sales quotes for customers.",
    icon: <FileTextOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "New Quote",
    path: "/inner/sales",
    typ:3,
  },
  {
    title: "Create Invoices",
    description: "Issue invoices to customers.",
    icon: <FileDoneOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "New Invoice",
    path: "/inner/sales",
    typ:2,
  },
  {
    title: "Statements",
    description: "Generate account statements.",
    icon: <FileTextOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "Generate Statement",
    path: "/inner/customersleads",
    typ:2,
  },
  {
    title: "Receive Payments",
    description: "Record payments from customers.",
    icon: <DollarCircleOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "Receive Payment",
    path: "/inner/customersleads",
    typ:3,
  },
  {
    title: "Income Tracker",
    description: "Track income from sales and services.",
    icon: <FundOutlined style={{ fontSize: "2rem" }} />,
    buttonText: "View Income",
    path: "/inner/customersleads",
    typ:4,
  },
];

const CustomerCenter = ({ navigate }) => {
  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Customer Center</Title>
      <Text type="secondary">Manage quotes, invoices, payments, and income tracking.</Text>

      <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
        {featureCards.map((card, index) => (
          <Col key={index} xs={24} sm={12} md={8}>
            <Card bordered hoverable>
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                {card.icon}
                <Title level={4}>{card.title}</Title>
                <Text>{card.description}</Text>
                <Button type="primary" block onClick={() => navigate(card.path)}>
                 
                    <Link to={{ pathname: `${card.path}`, state: { tabKey: `${card.typ}` } }}>
                  <span> {card.buttonText}</span></Link>
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default CustomerCenter;
