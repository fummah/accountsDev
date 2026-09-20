import React, { useState } from "react";
import Widget from "components/Widget/index";
import {Link} from "react-router-dom";
import {Table,Select,DatePicker,Space,Row,Col,Button} from "antd";
import {PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer} from "recharts";
import { useRedirectToItem } from 'util/navigation';
import { useCurrency } from '../../../utils/currency';
import usePeriodData from "./usePeriodData";


// Colors for each section of the pie chart
const COLORS = ['#0088FE', '#00C49F','yellow','purple','red','green','grey'];

const Option = Select.Option;

const formattedNumber = (number) => { return new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

const Expenses = ({ Expensed, ExpenseList, DailyRevenue, DailyExpenses, DailyCategories, MonthlyExpenses = {}, MonthlyCategories = {} }) => {
  const redirectToItem = useRedirectToItem();
  const { symbol: cSym } = useCurrency();
  const [period, setPeriod] = useState('thisMonth');
  const [customRange, setCustomRange] = useState([]);

  const data = usePeriodData({
    period, customRange,
    DailyRevenue, DailyExpenses, DailyCategories,
    MonthlyExpenses, MonthlyCategories,
    Expensed,
  });

  const useDaily = Array.isArray(DailyCategories) || Array.isArray(DailyExpenses);
  const displayExp = data.expenses || (Number(Expensed) || 0);
  const pieData = useDaily ? data.categories : (Array.isArray(ExpenseList) ? ExpenseList : []);

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
          Account Payable</h2>
      } extra={
        <Space wrap>
          <Select className="gx-mb-2 gx-select-sm" value={period} onChange={setPeriod} style={{ minWidth: 120 }}>
            {PERIODS.map(p => <Option key={p.value} value={p.value}>{p.label}</Option>)}
          </Select>
          {period === 'custom' && (
            <DatePicker.RangePicker
              allowClear={false}
              size="small"
              value={customRange.length === 2 ? customRange : null}
              onChange={(d) => setCustomRange(d || [])}
            />
          )}
        </Space>
    }>
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">{cSym}{formattedNumber(displayExp)}</h2>
            <h4 className="gx-pt-2 gx-chart-up">0% <i className="icon icon-menu-up gx-fs-sm"/></h4>
          </div>
          <p className="gx-text-grey">Spending for {data.label}</p>
          <Space wrap className="gx-mt-10">
            <Button className="gx-mr-2">
              <i className="icon icon-icon-listing-dbrd gx-fs-lg gx-d-inline-flex gx-vertical-align-left"/>
              <Link to="/main/vendors/bills/enter"> Enter Bill</Link>
            </Button>
            <Button className="gx-mr-2">
              <i className="icon icon-icon-listing-dbrd gx-fs-lg gx-d-inline-flex gx-vertical-align-left"/>
              <Link to="/main/vendors/bills/tracker"> Bill Management</Link>
            </Button>
          </Space>
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="">
        <ResponsiveContainer height={150}>
        <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={20}
          outerRadius={40}
          fill="#8884d8"
          paddingAngle={5}
          dataKey="value"
        >
          {pieData.map((entry, index) => (
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
