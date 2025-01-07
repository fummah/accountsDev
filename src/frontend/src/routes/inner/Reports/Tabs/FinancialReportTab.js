import React, {useState, useEffect} from "react";
import {Col, Row, DatePicker} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import ProfitAndLossSection from "./Sections/ProfitAndLossSection";
import BalanceSheetSection from "./Sections/BalanceSheetSection";
import CashFlowSection from "./Sections/CashFlowSection";
import moment from "moment";

const { RangePicker } = DatePicker;

const FinancialReportTab = () => {
  const [dummyData, setDummyData] = useState(null);
  
const currentMonthStart = moment().startOf("month");
const currentMonthEnd = moment().endOf("month");

const [dateRange, setDateRange] = useState([currentMonthStart, currentMonthEnd]);

   const fetchFinancialReports = async (start_date,last_date) => {
        try {
            const response = await await window.electronAPI.getFinancialReport(start_date,last_date);   
               
            setDummyData(response);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
         console.log(errorMessage);
        }
    };

    useEffect(() => {     
      fetchFinancialReports(currentMonthStart.format("YYYY-MM-DD"), currentMonthEnd.format("YYYY-MM-DD"));
  }, []);

  const onDateChange = (dates) => {
    if (dates) {
      setDateRange(dates); // Store moment objects or convert to desired format
      const [startDate, endDate] = dates; // Destructure start and end dates
      const start_date = startDate ? startDate.format("YYYY-MM-DD") : null;
      const last_date = endDate ? endDate.format("YYYY-MM-DD") : null;
      fetchFinancialReports(start_date, last_date);      
    }
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
<ProfitAndLossSection data={dummyData?.profitLoss}/>
     </Col>     

   <Col span={12}>
<BalanceSheetSection data={dummyData?.balanceSheet}/>
     </Col>  
     <Col span={12}>
<CashFlowSection data={dummyData?.cashFlow}/>
     </Col>     
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default FinancialReportTab;
