import React from "react";
import Widget from "components/Widget/index";
import {Link} from "react-router-dom";
import {Table,Select,Row,Col,Button} from "antd";
import {PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer} from "recharts";
import { useRedirectToItem } from 'util/navigation';


// Colors for each section of the pie chart
const COLORS = ['#0088FE', '#00C49F','yellow','purple','red','green','grey'];

const Option = Select.Option;

const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};


const Expenses = ({Expensed, ExpenseList}) => {
  const redirectToItem = useRedirectToItem();
const columns = [
  {
    title: 'Policyholder Name',
    dataIndex: 'image',
    render: (text, record) => {
      return <div className="gx-flex-row gx-align-items-center">
        <img className="gx-rounded-circle gx-size-30 gx-mr-2" src={text} alt=""/>
        <p className="gx-mb-0">{record.name}</p>
      </div>
    },
  },
  {
    title: 'Date Entered',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.transfer}</span>
    },

  },
  {
    title: 'Action',
    dataIndex: 'status',
    render: (text,record) => {
      return <span className="gx-text-primary gx-pointer" onClick={()=>redirectToItem(record.key,'claim')}>
        <i className="icon icon-forward gx-fs-sm gx-mr-2"/>{record.status}</span>
    },
  },

];
  return (
      <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Expenses</h2>
      } extra={
        <Select className="gx-mb-2 gx-select-sm" defaultValue="10">
        <Option value="10">THis Month</Option>
        <Option value="20">Last Month</Option>
      </Select>
    }>
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">${formattedNumber(Expensed)}</h2>
            <h4 className="gx-pt-2 gx-chart-up">0% <i className="icon icon-menu-up gx-fs-sm"/></h4>
          </div>
          <p className="gx-text-grey">Spending for December</p>
          <p className="gx-text-primary gx-mb-0 gx-pointer gx-d-block gx-mb-0 gx-mt-10">
          <Button className="gx-mr-2">
            <i className="icon icon-icon-listing-dbrd gx-fs-lg gx-d-inline-flex gx-vertical-align-left"/> 
            <Link to={{ pathname: "/inner/expenses", state: { tabKey: "2" } }}> View All Spending</Link>
            </Button>
            </p>
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

export default Expenses;
