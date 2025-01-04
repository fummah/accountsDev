import React from "react";
import {Col, Row, Table} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";


const CashFlowSection = ({data}) => {
  const tableData = [
    { key: "1", category: "Operating Activities", amount: data.operating },
    { key: "2", category: "Investing Activities", amount: data.investing },
    { key: "3", category: "Financing Activities", amount: data.financing },
    { key: "4", category: "Net Cash Flow", amount: data.netCashFlow },
  ];

  const columns = [
    {
      title: "Activity",
      dataIndex: "category",
      key: "category",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (value) => `$${value.toLocaleString()}`, // Format as currency
    },
  ];
  return (
    <Auxiliary> 
       <Widget>  
      <Row>
      <Col span={24}>
      <div>
      <h2>Cash Flow Statement</h2>
  <Table 
        dataSource={tableData} 
        columns={columns} 
        pagination={false} // Disable pagination for a simple table
      />
    </div>
        </Col>
              
      </Row>
      
      </Widget>
    </Auxiliary>
  );
};

export default CashFlowSection;
