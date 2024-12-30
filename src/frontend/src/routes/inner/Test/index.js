import React, { useState } from 'react';
import { Layout, Card } from 'antd';
import CustomerList from './CustomerList';
import CustomerDetails from './CustomerDetails';

const { Sider, Content } = Layout;

const CustomerPage = () => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const customers = [
    { name: 'Sample Customer', balance: 5.00, openBalance: 5.00, overduePayment: 5.00, company: '-', email: '-', phone: '-', billingAddress: '-', shippingAddress: '-', preferredDelivery: 'None' },
    // Add more customers as needed
  ];

  return (
    <Layout>
      <Sider width={300} style={{ background: '#fff', padding: 16 }}>
        <CustomerList customers={customers} onSelectCustomer={setSelectedCustomer} />
      </Sider>
      <Content style={{ padding: 16 }}>
        {selectedCustomer ? (
          <CustomerDetails customer={selectedCustomer} />
        ) : (
          <Card title="Select a customer to view details" />
        )}
      </Content>
    </Layout>
  );
};

export default CustomerPage;
