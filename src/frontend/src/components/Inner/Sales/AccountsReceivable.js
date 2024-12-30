import React from "react";
import Widget from "components/Widget/index";
import {Table,Select,Row,Col,Button} from "antd";
import {PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer} from "recharts";
import { Link } from "react-router-dom/cjs/react-router-dom.min";
import { useRedirectToItem } from 'util/navigation';

const data = [
  { name: 'Dues and subscriptions', value: 400 },
  { name: 'Equipment rental', value: 600 },
];

// Colors for each section of the pie chart
const COLORS = ['#0088FE', '#00C49F'];

const Option = Select.Option;




const AccountsReceivable = () => {
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
          Accounts Receivables</h2>
      } extra={
        <p className="gx-text-grey">As of today</p>
    }>
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">R179,626</h2>
          </div>
          <p className="gx-text-grey">Total A/R Amount</p>
         
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="">
        <ResponsiveContainer height={150}>
        <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={20}
          outerRadius={40}
          fill="#8884d8"
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
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
