import React, {useState, useEffect} from "react";
import { Card, DatePicker, Select, Table, Col, Row } from "antd";
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis} from "recharts";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";



const { RangePicker } = DatePicker;
const { Option } = Select;
// Dummy Data for KPIs
const kpiData = {
  totalRevenue: "$150,000",
  totalExpenses: "$50,000",
  netProfit: "$100,000",
  customerGrowth: "15%",
};



const ManagementReportTab = () => {
  // Dummy Data for Chart
const chartData = [
  { name: "Revenue", value: 150000 },
  { name: "Expenses", value: 50000 },
  { name: "Profit", value: 100000 },
];

// Dummy Data for Table
const tableData = [
  { key: "1", metric: "Revenue", value: "$150,000" },
  { key: "2", metric: "Expenses", value: "$50,000" },
  { key: "3", metric: "Net Profit", value: "$100,000" },
  { key: "4", metric: "Customer Growth", value: "15%" },
];

const columns = [
  { title: "Metric", dataIndex: "metric", key: "metric" },
  { title: "Value", dataIndex: "value", key: "value" },
];

// State for Customization
const [selectedMetric, setSelectedMetric] = useState("Revenue");

// Chart Config (Bar Chart)
const config = {
  data: chartData,
  xField: "value",
  yField: "category",
  colorField: "category",
  color: ["#1890ff", "#ff4d4f", "#52c41a"],
  legend: false,
};
  return (
    <Auxiliary> 
    <Widget
  >  
   <Row>
   <Col span={24}>
   <div style={{ padding: "20px" }}>
      <h1>Management Reports</h1>

      {/* Date Range Picker */}
      <Card style={{ marginBottom: "20px" }}>
        <h3 className="gx-ml-3">Date Range</h3>
        <RangePicker style={{ width: "100%" }} />
      </Card>

      {/* KPIs */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Total Revenue</div>} bordered>
            {kpiData.totalRevenue}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Total Expenses</div>} bordered>
            {kpiData.totalExpenses}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Net Profit</div>} bordered>
            {kpiData.netProfit}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Customer Growth</div>} bordered>
            {kpiData.customerGrowth}
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <Card title={<div style={{ marginLeft: "20px" }}>Performance Overview</div>} style={{ marginTop: "20px" }}>
       <ResponsiveContainer width="100%" height={150}>
           <BarChart data={chartData}
                     margin={{top: 0, right: 0, left: 0, bottom: 0}}>
             <Tooltip/>
             <XAxis dataKey="name"/>             
             <Bar dataKey="value" stackId="value" fill="#038fde" barSize={10}/>
           </BarChart>
         </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title={<div style={{ marginLeft: "20px" }}>Detailed Metrics</div>} style={{ marginTop: "20px" }}>
        <Table dataSource={tableData} columns={columns} pagination={false} />
      </Card>

      {/* Customization Options */}
      <Card title={<div style={{ marginLeft: "20px" }}>Customize Report</div>} style={{ marginTop: "20px" }}>
        <h4>Select Metric</h4>
        <Select
          defaultValue={selectedMetric}
          style={{ width: "100%" }}
          onChange={(value) => setSelectedMetric(value)}
        >
          <Option value="Revenue">Revenue</Option>
          <Option value="Expenses">Expenses</Option>
          <Option value="Profit">Profit</Option>
          <Option value="Growth">Customer Growth</Option>
        </Select>
      </Card>
    </div>
     </Col>
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default ManagementReportTab;
