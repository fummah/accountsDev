import React from 'react';
import { List, Input, Card } from 'antd';

const CustomerList = ({ customers, onSelectCustomer }) => (
  <Card title="Customers">
    <Input.Search placeholder="Search by name or details" style={{ marginBottom: 16 }} />
    <List
      dataSource={customers}
      renderItem={(customer) => (
        <List.Item onClick={() => onSelectCustomer(customer)} style={{ cursor: 'pointer' }}>
          <List.Item.Meta title={customer.name} description={`R${customer.balance}`} />
        </List.Item>
      )}
    />
  </Card>
);

export default CustomerList;
