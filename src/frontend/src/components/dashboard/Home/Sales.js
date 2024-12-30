import React from "react";
import Widget from "components/Widget/index";
import {Table,Select,Row,Col,Button} from "antd";
import {Area, AreaChart, ResponsiveContainer, Tooltip, XAxis} from "recharts";

const data = [
  {name: '', balance: 0},
];

const Option = Select.Option;

const COLORS = ['#0088FE', '#00C49F','yellow','purple','red','green','grey'];
const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};


const Sales = ({Invoiced, ExpenseList}) => {

  return (
      <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Sales</h2>
      } extra={
        <Select className="gx-mb-2 gx-select-sm" defaultValue="10">
        <Option value="10">Last 10 days</Option>
        <Option value="20">Last 20 days</Option>
        <Option value="30">Last 30 days</Option>
      </Select>
    }>
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">${formattedNumber(Invoiced)}</h2>
          </div>
          <p className="gx-text-grey">Total sales</p>
         
        </Col>
        <Col lg={24} md={24} sm={24} xs={24}>
        
          <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data}
                   margin={{top: 0, right: 0, left: 0, bottom: 0}}>
          <Tooltip/>
          <XAxis dataKey="name"/>
          <defs>
            <linearGradient id="color15" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38AAE5" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#F5FCFD" stopOpacity={0.8}/>
            </linearGradient>
          </defs>
          <Area dataKey='balance' strokeWidth={2} stackId="2" stroke='#10316B' fill="url(#color15)"
                fillOpacity={1}/>
        </AreaChart>
      </ResponsiveContainer>
          </Col>
        </Row>
        
      
    </Widget>
  );
};

export default Sales;
