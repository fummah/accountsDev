import React from "react";
import {Col, Row, Table, Typography} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";

const { Text } = Typography;
const fmt = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ProfitAndLossSection = ({data}) => {
  const incomeAccounts = Array.isArray(data?.incomeAccounts) ? data.incomeAccounts : [];
  const expenseAccounts = Array.isArray(data?.expenseAccounts) ? data.expenseAccounts : [];

  const tableData = [
    ...incomeAccounts.map((a, i) => ({ key: `inc-${i}`, category: `  ${a.name}`, amount: a.amount, isDetail: true })),
    { key: "1", category: "Total Revenue", amount: data?.revenue || 0, isBold: true },
    { key: "2", category: "Cost of Goods Sold", amount: data?.cogs || 0 },
    { key: "3", category: "Gross Profit", amount: data?.grossProfit || 0, isBold: true },
    ...expenseAccounts.map((a, i) => ({ key: `exp-${i}`, category: `  ${a.name}`, amount: a.amount, isDetail: true })),
    { key: "4", category: "Total Expenses", amount: data?.operatingExpenses || 0, isBold: true },
    { key: "5", category: "Net Income", amount: data?.netProfit || 0, isBold: true, isTotal: true },
  ];

  const columns = [
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      render: (text, record) => record.isBold ? <Text strong>{text}</Text> : <span style={record.isDetail ? { paddingLeft: 16, color: '#555' } : {}}>{text}</span>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      align: 'right',
      render: (value, record) => {
        const formatted = fmt(value);
        if (record.isTotal) return <Text strong style={{ fontSize: 14, color: Number(value) >= 0 ? '#3f8600' : '#cf1322' }}>{formatted}</Text>;
        if (record.isBold) return <Text strong>{formatted}</Text>;
        return formatted;
      },
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
        pagination={false}
        size="small"
        showHeader={true}
      />
    </div>
        </Col>
      </Row>
      </Widget>
    </Auxiliary>
  );
};

export default ProfitAndLossSection;
