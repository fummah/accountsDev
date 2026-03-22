import React, {useState, useEffect} from "react";
import { Card, DatePicker, Select, Table, Col, Row, Button, message } from "antd";
import { PrinterOutlined } from '@ant-design/icons';
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis} from "recharts";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import moment from "moment";

const formattedNumber = (number) => { 
  const num = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number); 
  return `$${num}`;
};

const PrintableManagementReport = React.forwardRef(({ kpiData, tableData, chartData, companyName = 'Company' }, ref) => {
  const rows = tableData || [];
  return (
    <div id="printable-management-report" ref={ref} style={{ padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{ marginBottom: 4 }}>{companyName}</h1>
        <h2 style={{ marginTop: 0 }}>Management Report</h2>
        <div style={{ fontSize: 12, color: '#666' }}>Generated: {new Date().toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', gap: 20, margin: '20px 0' }}>
        <div style={{ flex: 1 }}>
          <div><strong>Total Revenue:</strong> {formattedNumber(kpiData?.totalRevenue || 0)}</div>
          <div><strong>Total Expenses:</strong> {formattedNumber(kpiData?.totalExpenses || 0)}</div>
          <div><strong>Net Profit:</strong> {formattedNumber(kpiData?.netProfit || 0)}</div>
        </div>
        <div style={{ width: 300, height: 120 }}>
          {/* Render a small chart snapshot if chartData is provided */}
          {chartData && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Tooltip/>
                <XAxis dataKey="name" hide />
                <Bar dataKey="value" fill="#038fde" barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <Table dataSource={rows} columns={[{title:'Metric', dataIndex:'metric'}, {title:'Value', dataIndex:'value'}]} pagination={false} rowKey={(r, i) => i} />
      <div style={{ marginTop: 20, textAlign: 'right', fontSize: 12 }}>Page 1</div>
    </div>
  );
});





const { RangePicker } = DatePicker;
const { Option } = Select;




const ManagementReportTab = () => {
  const [kpiData, setKpiData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [tableData, setTableData] = useState(null);
  const componentRef = useRef();
  const handlePrint = useReactToPrint({
    content: () => {
      // prefer ref, fallback to element by id
      return componentRef.current || document.getElementById('printable-management-report');
    },
    documentTitle: 'Management_Report',
    onBeforeGetContent: () => console.log('Preparing management report for print'),
    onAfterPrint: () => { console.log('Management report printed'); message.success('Management report printed'); }
  });

  const currentMonthStart = moment().startOf("month");
  const currentMonthEnd = moment().endOf("month");
  
  const [dateRange, setDateRange] = useState([currentMonthStart, currentMonthEnd]);


const columns = [
  { title: "Metric", dataIndex: "metric", key: "metric" },
  { title: "Value", dataIndex: "value", key: "value" },
  
];

// State for Customization
const [selectedMetric, setSelectedMetric] = useState("Revenue");

  const fetchManagementReports = async (start_date,last_date) => {
        try {
            const response = await await window.electronAPI.getManagementReport(start_date,last_date);   
            console.log(response);       
            setKpiData(response.kpiData);
            setChartData(response.chartData);
            setTableData(response.tableData);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
         console.log(errorMessage);
        }
    };

    useEffect(() => {     
      fetchManagementReports(currentMonthStart.format("YYYY-MM-DD"), currentMonthEnd.format("YYYY-MM-DD"));
  }, []);

const onDateChange = (dates) => {
  if (dates) {
    setDateRange(dates); // Store moment objects or convert to desired format
    const [startDate, endDate] = dates; // Destructure start and end dates
    const start_date = startDate ? startDate.format("YYYY-MM-DD") : null;
    const last_date = endDate ? endDate.format("YYYY-MM-DD") : null;
    fetchManagementReports(start_date, last_date);      
  }
};
  return (
    <Auxiliary> 
    <Widget
  >  
   <Row>
   <Col span={24}>
   <div style={{ padding: "20px" }}>
      <h1>Management Reports</h1>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="default" icon={<PrinterOutlined />} onClick={() => {
          if (!tableData && !kpiData) {
            message.warning('No report data to print');
            return;
          }
          const el = componentRef.current || document.getElementById('printable-management-report');
          if (!el) {
            message.error('There is nothing to print');
            return;
          }
          handlePrint();
        }}>Print</Button>
      </div>

      {/* Date Range Picker */}
      <Card style={{ marginBottom: "20px" }}>
             
        <RangePicker
        style={{ width: "100%" }}
    value={dateRange} // Set the default date range
    onChange={onDateChange} // Update state when the range changes
    format="YYYY-MM-DD" // Format for the displayed dates
    allowClear={true}
  />
      </Card>

      {/* KPIs */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Total Revenue</div>} bordered>
            {formattedNumber(kpiData?.totalRevenue || 0)}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Total Expenses</div>} bordered>
            {formattedNumber(kpiData?.totalExpenses || 0)}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Net Profit</div>} bordered>
            {formattedNumber(kpiData?.netProfit)}
          </Card>
        </Col>
        <Col span={6}>
          <Card title={<div style={{ marginLeft: "20px" }}>Customer Growth</div>} bordered>
            {kpiData?.customerGrowth || '0%'}
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
  {/* Off-screen printable content */}
  <ManagementReportPrintableWrapper kpiData={kpiData} tableData={tableData} chartData={chartData} refProp={componentRef} />
    </div>
     </Col>
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default ManagementReportTab;

// Hidden printable content
// Rendered outside visible area so react-to-print can capture it
const ManagementReportPrintableWrapper = ({ kpiData, tableData, chartData, refProp }) => (
  <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '100%' }}>
    <PrintableManagementReport ref={refProp} kpiData={kpiData} tableData={tableData} chartData={chartData} />
  </div>
);
