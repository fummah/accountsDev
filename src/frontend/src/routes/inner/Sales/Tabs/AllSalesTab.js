import React, { useState } from 'react';
import {Col, Row,Card, Progress} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import styled from 'styled-components';
import SalesList from "components/Inner/Sales/AllSales/SalesList";
import AddTransaction from 'components/Inner/Sales/AllSales/AddTransaction';

import {salesList} from "../data";

const data = [
  { title: 'R0', description: '0 estimates', color: '#40a9ff', wd:4 },
  { title: 'R0', description: 'Unbilled income', color: '#9254de', wd:5 },
  { title: 'R90', description: '1 overdue invoice', color: '#fa8c16', wd:5 },
  { title: 'R6,660', description: '6 open invoices / credits', color: '#d9d9d9', wd:5 },
  { title: 'R0', description: '0 recently paid', color: '#52c41a', wd:5 },
];



const ProgressBar = styled(Progress)` 
  .ant-progress-inner {
    background-color: ${(props) => props.bgcolor};
  }
`;

const AllSalesTab = () => {
  const [loadings, setLoadings] = useState([]);

  return (
    <Auxiliary> 
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Sales Transactions</h2>
   } 
   
   extra={
   <AddTransaction type="transaction"/>
   }>  
  <Row gutter={[16, 16]}>
        {data.map((item, index) => (
          <Col key={index} xs={24} sm={12} md={item.wd}>
            <Card bordered={false}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ProgressBar
                percent={100}
                showInfo={false}
                strokeColor={item.color}
                bgcolor={item.color}
              />
            </Card>
          </Col>
        ))}
       
       <Col xs={24} sm={24} md={24}>
       <SalesList sales={salesList}/>
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default AllSalesTab;
