import React, {useState, useEffect} from "react";
import {Col, Row, Table, DatePicker} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import moment from "moment";

const { RangePicker } = DatePicker;


  const formattedNumber = (number) => { 
    const num = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number); 
  return `$${num}`;
  };

const TaxReportTab = () => {
  const [dummyData, setDummyData] = useState([]);
    const currentMonthStart = moment().startOf("month");
    const currentMonthEnd = moment().endOf("month");
    
    const [dateRange, setDateRange] = useState([currentMonthStart, currentMonthEnd]);


     const fetchVatReports = async (start_date,last_date) => {
          try {
              const response = await await window.electronAPI.getVatReport(start_date,last_date);   
                 
              setDummyData(response);
          } catch (error) {
            const errorMessage = error.message || "An unknown error occurred.";
           console.log(errorMessage);
          }
      };
  
      useEffect(() => {     
        fetchVatReports(currentMonthStart.format("YYYY-MM-DD"), currentMonthEnd.format("YYYY-MM-DD"));
    }, []);

  const onDateChange = (dates) => {
    if (dates) {
      setDateRange(dates); // Store moment objects or convert to desired format
      const [startDate, endDate] = dates; // Destructure start and end dates
      const start_date = startDate ? startDate.format("YYYY-MM-DD") : null;
      const last_date = endDate ? endDate.format("YYYY-MM-DD") : null;
      fetchVatReports(start_date, last_date);      
    }
  };
  
  // Define columns for the Ant Design table
  const columns = [
    {
      title: 'Vat(%)',
      dataIndex: 'vat',
      key: 'vat',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.vat}%</span>
      },
    },
    {
      title: 'Income',
      dataIndex: 'revenue_total_amount',
      key: 'revenue_total_amount',
      render: (text, record) => {
        return <span className="gx-text-grey">{formattedNumber(record.revenue_total_amount)}</span>
      },
    },
    {
      title: 'Income Ex Vat',
      dataIndex: 'pure_amount',
      key: 'pure_amount',
      render: (text, record) => {
        return <span className="gx-text-grey">{formattedNumber(record.pure_amount)}</span>
      },
    },
    {
      title: 'Vat Total',
      dataIndex: 'total_vat_sum',
      key: 'total_vat_sum',
      render: (text, record) => {
        return <span className="gx-text-grey">{formattedNumber(record.total_vat_sum)}</span>
      },
    },
  ];
  return (
    <Auxiliary> 
    <Widget>  
   <Row>
   <Col span={24}>
   <h1>Tax Reports</h1>
   <RangePicker
        style={{ width: "100%" }}
    value={dateRange} // Set the default date range
    onChange={onDateChange} // Update state when the range changes
    format="YYYY-MM-DD" // Format for the displayed dates
    allowClear={true}
  />
   <Table dataSource={dummyData} columns={columns} />
     </Col>
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default TaxReportTab;
