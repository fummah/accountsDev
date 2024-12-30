import React from 'react';
import { Card, Descriptions, Statistic, Row, Col } from 'antd';

const CustomerDetails = ({ customer }) => (
  <Card title={customer.name} extra={<button>Edit</button>} style={{ marginLeft: 16 }}>
    <Row gutter={16}>
      <Col span={12}>
        <Statistic title="Open Balance" value={`R${customer.openBalance}`} valueStyle={{ color: '#3f8600' }} />
      </Col>
      <Col span={12}>
        <Statistic title="Overdue Payment" value={`R${customer.overduePayment}`} valueStyle={{ color: '#cf1322' }} />
      </Col>
    </Row>
    <Descriptions title="Customer Details" bordered style={{ marginTop: 16 }}>
      <Descriptions.Item label="Company">{customer.company}</Descriptions.Item>
      <Descriptions.Item label="Email">{customer.email}</Descriptions.Item>
      <Descriptions.Item label="Phone">{customer.phone}</Descriptions.Item>
      <Descriptions.Item label="Billing Address">{customer.billingAddress}</Descriptions.Item>
      <Descriptions.Item label="Shipping Address">{customer.shippingAddress}</Descriptions.Item>
      <Descriptions.Item label="Preferred Delivery">{customer.preferredDelivery}</Descriptions.Item>
    </Descriptions>
  </Card>
);

export default CustomerDetails;
