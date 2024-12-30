import React from "react";
import Widget from "components/Widget/index";
import {Table,Select,Row,Col,Button} from "antd";
import {PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer} from "recharts";

// Colors for each section of the pie chart
const COLORS = ['#0088FE', '#00C49F','yellow','purple','red','green','grey'];


const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};


const AccountsReceivable = ({Invoiced, ExpenseList}) => {

  return (
      <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Accounts Receivables</h2>
      } extra={
        <p className="gx-text-grey">As of today</p>
    }>
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">${formattedNumber(Invoiced)}</h2>
          </div>
          <p className="gx-text-grey">Total A/R Amount</p>
         
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="">
        <ResponsiveContainer height={150}>
        <PieChart>
        <Pie
          data={ExpenseList}
          cx="50%"
          cy="50%"
          innerRadius={20}
          outerRadius={40}
          fill="#8884d8"
          paddingAngle={5}
          dataKey="value"
        >
          {ExpenseList.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
      </ResponsiveContainer>
      </div>
      
        </Col>
        </Row>
        
      
    </Widget>
  );
};

export default AccountsReceivable;
