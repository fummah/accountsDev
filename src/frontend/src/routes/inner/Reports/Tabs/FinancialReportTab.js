import React, {useState, useEffect} from "react";
import {Col, Row, DatePicker, message, Button, Space} from "antd";
import { SyncOutlined } from '@ant-design/icons';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import ProfitAndLossSection from "./Sections/ProfitAndLossSection";
import BalanceSheetSection from "./Sections/BalanceSheetSection";
import CashFlowSection from "./Sections/CashFlowSection";
import moment from "moment";

const { RangePicker } = DatePicker;

const FinancialReportTab = () => {
  const [dummyData, setDummyData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  
const currentMonthStart = moment().startOf("month");
const currentMonthEnd = moment().endOf("month");

const [dateRange, setDateRange] = useState([currentMonthStart, currentMonthEnd]);

  const handleSyncJournal = async () => {
    setSyncing(true);
    try {
      const res = await window.electronAPI.journalRepostAll?.();
      if (res?.success) {
        message.success(`Synced: ${res.posted} posted, ${res.skipped} already existed`);
        fetchFinancialReports(dateRange[0].format("YYYY-MM-DD"), dateRange[1].format("YYYY-MM-DD"));
      } else {
        message.error(res?.error || 'Sync failed');
      }
    } catch (e) { message.error('Sync error: ' + (e?.message || '')); }
    setSyncing(false);
  };

   const fetchFinancialReports = async (start_date,last_date) => {
        try {
            const response = await window.electronAPI.getFinancialReport(start_date,last_date);
            if (!response) {
              message.error('No data returned from backend');
              return;
            }
            if (response.error) {
              message.error(response.error || 'Error fetching financial report');
              return;
            }
            // Response expected to be object with profitLoss, balanceSheet, cashFlow
            setDummyData(response);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
         console.log(errorMessage);
         message.error(errorMessage);
        }
    };

    useEffect(() => {
      // Auto-sync journal entries from existing invoices/expenses then load reports
      (async () => {
        try { await window.electronAPI.journalRepostAll?.(); } catch {}
        fetchFinancialReports(currentMonthStart.format("YYYY-MM-DD"), currentMonthEnd.format("YYYY-MM-DD"));
      })();
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
    <Space>
      <Button icon={<SyncOutlined spin={syncing} />} onClick={handleSyncJournal} loading={syncing} size="small">Sync Journal</Button>
      <RangePicker
        value={dateRange}
        onChange={onDateChange}
        format="YYYY-MM-DD"
        allowClear={true}
      />
    </Space>
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
