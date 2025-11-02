import React,{useState, useEffect} from "react";
import {Col, Row} from "antd";

import {Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip} from "recharts";
import ChartCard from "components/dashboard/Home/ChartCard";
import Auxiliary from "util/Auxiliary";
import WelComeCard from "components/dashboard/Home/WelComeCard";
import ProfitAndLoss from "components/dashboard/Home/ProfitAndLoss";
import Expenses from "components/dashboard/Home/Expenses";
import CashFlowTrend from "components/dashboard/Home/CashFlowTrend";
import InvoicesCard from "components/dashboard/Home/InvoicesCard";
import AccountsPayable from "components/dashboard/Home/AccountsPayable";
import AccountsReceivable from "components/dashboard/Home/AccountsReceivable";
import CompanySnapshot from "components/dashboard/Home/CompanySnapshot";
import Sales from "components/dashboard/Home/Sales";
import Toast from "components/AppNotification/toast.js";

const HomeTab = () => {
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [openinvoice, setOpenInvoice] = useState(0);
  const [dueinvoice, setDueInvoice] = useState(0);
  const [duequote, setDueQuote] = useState(0);
  const [openexpense, setOpenExpense] = useState(0);
  const [dueexpense, setDueExpense] = useState(0);
  const [openinvoicemoney, setOpenInvoiceMoney] = useState(0);
  const [dueinvoicemoney, setDueInvoiceMoney] = useState(0);
  const [openexpensemoney, setOpenExpenseMoney] = useState(0);
  const [dueexpensemoney, setDueExpenseMoney] = useState(0);
  const [invoicepaidtrend, setInvoicePaidTrend] = useState([]);
  const [customertrend, setCustomerTrend] = useState([]);
  const [suppliertrend, setSupplierTrend] = useState([]);
  const [expenselist, setExpenseList] = useState([]);
  const [report, setReport] = useState(null);

  const fetchInitials = async () => {
    try {
      const response = await window.electronAPI.getDashboardSummary();

      if (!response || response.error) {
        const errorMessage = response?.error || 'No dashboard data returned';
        setMessage(`Error fetching summary: ${errorMessage}`);
        setShowError(true);
        return;
      }

      // Safely read fields with fallbacks
      const openInv = (response.open_invoice && response.open_invoice[0] && Number(response.open_invoice[0].open_invoice)) || 0;
      const dueInv = (response.due_invoice && response.due_invoice[0] && Number(response.due_invoice[0].due_invoice)) || 0;
      const dueQ = (response.due_quote && response.due_quote[0] && Number(response.due_quote[0].due_quote)) || 0;
      const openInvMoney = (response.open_invoice && response.open_invoice[0] && Number(response.open_invoice[0].open_total_amount)) || 0;
      const dueInvMoney = (response.due_invoice && response.due_invoice[0] && Number(response.due_invoice[0].due_total_amount)) || 0;
      const openExp = (response.open_expense && response.open_expense[0] && Number(response.open_expense[0].open_expense)) || 0;
      const dueExp = (response.due_expense && response.due_expense[0] && Number(response.due_expense[0].due_expense)) || 0;
      const openExpMoney = (response.open_expense && response.open_expense[0] && Number(response.open_expense[0].open_total_amount_expense)) || 0;
      const dueExpMoney = (response.due_expense && response.due_expense[0] && Number(response.due_expense[0].due_total_amount_expense)) || 0;

      setOpenInvoice(openInv);
      setDueInvoice(dueInv);
      setDueQuote(dueQ);
      setOpenInvoiceMoney(openInvMoney);
      setDueInvoiceMoney(dueInvMoney);
      setOpenExpense(openExp);
      setDueExpense(dueExp);
      setOpenExpenseMoney(openExpMoney);
      setDueExpenseMoney(dueExpMoney);

      setInvoicePaidTrend(Array.isArray(response.invoicetrend) ? response.invoicetrend : []);
      setCustomerTrend(Array.isArray(response.customertrend) ? response.customertrend : []);
      setSupplierTrend(Array.isArray(response.suppliertrend) ? response.suppliertrend : []);
      setExpenseList(Array.isArray(response.expenseAnalysis) ? response.expenseAnalysis : (Array.isArray(response.expenselist) ? response.expenselist : []));
      setReport(response.report || null);
    } catch (error) {
      const errorMessage = error.message || "An unknown error occurred.";
      setMessage(`Error fetching summary: ${errorMessage}`);
      setShowError(true);
    }
  };

useEffect(() => {
  const initialize = async () => {
    await fetchInitials(); // Fetch initial data   
  }; 

  initialize();
}, []);


  return (
    <Auxiliary>   
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} /> 
      <Row>
      <Col span={24}>
          <div className="gx-card">
            <div className="gx-card-body">
              <Row>
                <Col xl={6} lg={12} md={12} sm={12} xs={24}>
                  <WelComeCard UnpaidInvoices={dueinvoice} DueQuotes={duequote} DuePayments={dueexpense}/>
                </Col>

                <Col xl={6} lg={12} md={12} sm={12} xs={24}>
          <ChartCard prize={invoicepaidtrend.length > 0 ? invoicepaidtrend[invoicepaidtrend.length - 1]?.number || 0 : 0} title="0" icon="crm"
                     children={<ResponsiveContainer width="100%" height={100}>
                       <AreaChart data={invoicepaidtrend}
                                  margin={{top: 0, right: 0, left: 0, bottom: 0}}>
                         <Tooltip/>
                         <defs>
                           <linearGradient id="color4" x1="0" y1="0" x2="1" y2="0">
                             <stop offset="5%" stopColor="#4ECDE4" stopOpacity={0.9}/>
                             <stop offset="95%" stopColor="#06BB8A" stopOpacity={0.9}/>
                           </linearGradient>
                         </defs>
                         <Area dataKey='number' type='monotone' strokeWidth={0} stackId="2" stroke='#4D95F3'
                               fill="url(#color4)"
                               fillOpacity={1}/>
                       </AreaChart>
                     </ResponsiveContainer>}
                     styleName="up" desc="Paid Invoices"/>
        </Col>
        <Col xl={6} lg={12} md={12} sm={12} xs={24}>
          <ChartCard prize={customertrend.length > 0 ? customertrend[customertrend.length - 1]?.number || 0 : 0}  title="0" icon="user"
                     children={<ResponsiveContainer width="100%" height={100}>
                       <AreaChart data={customertrend}
                                  margin={{top: 0, right: 0, left: 0, bottom: 0}}>
                         <Tooltip/>
                         <defs>
                           <linearGradient id="color5" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#e81a24" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#FEEADA" stopOpacity={0.8}/>
                           </linearGradient>
                         </defs>
                         <Area dataKey='number' strokeWidth={0} stackId="2" stroke='#FEEADA' fill="url(#color5)"
                               fillOpacity={1}/>
                       </AreaChart>
                     </ResponsiveContainer>}
                     styleName="down" desc="Total Customers"/>
        </Col>
        <Col xl={6} lg={12} md={12} sm={12} xs={24}>
          <ChartCard prize={suppliertrend.length > 0 ? suppliertrend[suppliertrend.length - 1]?.number || 0 : 0} title="0" icon="card"
                     children={<ResponsiveContainer width="100%" height={100}>

                       <LineChart data={suppliertrend}
                                  margin={{top: 5, right: 5, left: 5, bottom: 5}}>
                         <Tooltip/>
                         <Line dataKey="number" stroke="#038FDE" dot={{stroke: '#FEA931', strokeWidth: 2}}/>
                       </LineChart>
                     </ResponsiveContainer>}
                     styleName="down" desc="Total Suppliers"/>
        </Col>
              </Row>
            </div>
          </div>
        </Col>

        <Col xl={14} lg={24} md={14} sm={24} xs={24}>
          <ProfitAndLoss 
            CurrentBalance = {(Number(openinvoicemoney) || 0) - (Number(openexpensemoney) || 0)} 
            Invoiced = {Number(openinvoicemoney) || 0} 
            Expensed = {Number(openexpensemoney) || 0}/>
        </Col>
        <Col xl={10} lg={24} md={10} sm={24} xs={24}>
        <Expenses Expensed = {openexpensemoney} ExpenseList = {expenselist}/>
        </Col>

        <Col xl={14} lg={24} md={14} sm={24} xs={24}>
          <CashFlowTrend/>
        </Col>
        <Col xl={10} lg={24} md={10} sm={24} xs={24}>
          <InvoicesCard Report = {report}/>
        </Col>
        <Col xl={8} lg={24} md={8} sm={24} xs={24}>
          <AccountsReceivable Invoiced = {openinvoicemoney} ExpenseList = {expenselist}/>
        </Col>
        <Col xl={8} lg={24} md={8} sm={24} xs={24}>
          <AccountsPayable Expensed = {openexpensemoney} ExpenseList = {expenselist}/>
        </Col>
        <Col xl={8} lg={24} md={8} sm={24} xs={24}>
          <Sales Invoiced = {openinvoicemoney}/>
        </Col>
              
      </Row>
<CompanySnapshot/>
    </Auxiliary>
  );
};

export default HomeTab;
