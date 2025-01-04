import React from "react";
import {Col, Row, Table} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";

const dummyData = [
  {
    id: 1,
    name: 'John Doe',
    income: 50000,
    taxRate: 0.2,
  },
  {
    id: 2,
    name: 'Jane Smith',
    income: 75000,
    taxRate: 0.25,
  },
  {
    id: 3,
    name: 'Alice Johnson',
    income: 120000,
    taxRate: 0.3,
  },
];

const calculateTax = (income, taxRate) => {
  return income * taxRate;
};


const TaxReportTab = () => {
  const dataSource = dummyData.map((person) => ({
    key: person.id,
    name: person.name,
    income: `$${person.income.toLocaleString()}`,
    taxRate: `${(person.taxRate * 100).toFixed(0)}%`,
    calculatedTax: `$${calculateTax(person.income, person.taxRate).toFixed(2)}`,
  }));
  
  // Define columns for the Ant Design table
  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Income',
      dataIndex: 'income',
      key: 'income',
    },
    {
      title: 'Tax Rate',
      dataIndex: 'taxRate',
      key: 'taxRate',
    },
    {
      title: 'Calculated Tax',
      dataIndex: 'calculatedTax',
      key: 'calculatedTax',
    },
  ];
  return (
    <Auxiliary> 
    <Widget>  
   <Row>
   <Col span={24}>
   <h1>Tax Reports</h1>
   <Table dataSource={dataSource} columns={columns} />
     </Col>
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default TaxReportTab;
