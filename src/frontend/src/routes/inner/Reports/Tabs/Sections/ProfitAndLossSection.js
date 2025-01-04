import React from "react";
import {Col, Row, Table} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";


const ProfitAndLossSection = ({data}) => {
  const tableData = [
    { key: "1", category: "Revenue", amount: data.revenue },
    { key: "2", category: "COGS", amount: data.cogs },
    { key: "3", category: "Gross Profit", amount: data.grossProfit },
    { key: "4", category: "Operating Expenses", amount: data.operatingExpenses },
    { key: "5", category: "Net Profit", amount: data.netProfit },
  ];

  const columns = [
    {
      title: "Category",
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
      <h2>Profit and Loss Statement</h2>
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

export default ProfitAndLossSection;
