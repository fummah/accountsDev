import React from 'react';
import {Link} from "react-router-dom";
import {  Menu, Row, Col } from 'antd';

const PopOverComponent = (
    <div>
      <Row gutter={16}>
        <Col span={12}>
          <strong>Customers</strong>
          <Menu>
          <Menu.Item key="4"><Link to={{ pathname: "/inner/sales", state: { tabKey: "4", new:1 } }}>Customer</Link></Menu.Item>
          <Menu.Item key="2"><Link to={{ pathname: "/inner/sales", state: { tabKey: "2", new:1  } }}>Invoice</Link></Menu.Item>
          <Menu.Item key="3"><Link to={{ pathname: "/inner/sales", state: { tabKey: "3", new:1  } }}>Quote</Link></Menu.Item>
          <Menu.Item key="5"><Link to={{ pathname: "/inner/sales", state: { tabKey: "5", new:1  } }}>Product</Link></Menu.Item>
          
          </Menu>
        </Col>
        <Col span={12}>
          <strong>Suppliers</strong>
          <Menu>
          <Menu.Item key="6"><Link to={{ pathname: "/inner/expenses", state: { tabKey: "1", new:1  } }}>Expense</Link></Menu.Item>
          <Menu.Item key="7"><Link to={{ pathname: "/inner/expenses", state: { tabKey: "2", new:1  } }}>Supplier</Link></Menu.Item>
          </Menu>
        </Col>
       
      </Row>
    </div>
  );
  export default PopOverComponent;
