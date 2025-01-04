import React, {useState} from "react";
import {Col, Row, DatePicker} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import ProfitAndLossSection from "./Sections/ProfitAndLossSection";
import BalanceSheetSection from "./Sections/BalanceSheetSection";
import CashFlowSection from "./Sections/CashFlowSection";
import moment from "moment";

const { RangePicker } = DatePicker;


const dummyData = {
  profitLoss: {
    revenue: 50000,
    cogs: 20000,
    operatingExpenses: 15000,
    grossProfit: 30000, // Calculated as revenue - cogs
    netProfit: 15000, // Calculated as grossProfit - operatingExpenses
  },
  balanceSheet: {
    assets: {
      cash: 20000,
      accountsReceivable: 15000,
      inventory: 10000,
      total: 45000,
    },
    liabilities: {
      accountsPayable: 10000,
      shortTermDebt: 5000,
      total: 15000,
    },
    equity: {
      retainedEarnings: 20000,
      shareholderEquity: 10000,
      total: 30000,
    },
  },
  cashFlow: {
    operating: 10000,
    investing: -5000,
    financing: 5000,
    netCashFlow: 10000, // Sum of all activities
  },
};


const FinancialReportTab = () => {
  
  
const currentMonthStart = moment().startOf("month");
const currentMonthEnd = moment().endOf("month");

const [dateRange, setDateRange] = useState([currentMonthStart, currentMonthEnd]);

const onDateChange = (dates) => {
  setDateRange(dates); // Dates will now be `moment` objects
};
  return (
    <Auxiliary> 
    <Widget
   title={
     <h2 className="h4 gx-text-capitalize gx-mb-0">
       Financial Reports</h2>
   }
   extra={
    <RangePicker
    value={dateRange} // Set the default date range
    onChange={onDateChange} // Update state when the range changes
    format="YYYY-MM-DD" // Format for the displayed dates
    allowClear={true}
  />
   }
   >  
   <Row>
   <Col span={12}>
<ProfitAndLossSection data={dummyData.profitLoss}/>
     </Col>     

   <Col span={12}>
<BalanceSheetSection data={dummyData.balanceSheet}/>
     </Col>  
     <Col span={12}>
<CashFlowSection data={dummyData.cashFlow}/>
     </Col>     
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default FinancialReportTab;
