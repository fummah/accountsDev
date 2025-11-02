import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {Col, Row} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import Money from "assets/img/money.png";
import MoneyOut from "assets/img/money-out.png";
import Toast from "components/AppNotification/toast.js";

const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};

const CashFlowTab = () => {
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [openinvoice, setOpenInvoice] = useState(0);
  const [dueinvoice, setDueInvoice] = useState(0);
  const [openexpense, setOpenExpense] = useState(0);
  const [dueexpense, setDueExpense] = useState(0);
  const [openinvoicemoney, setOpenInvoiceMoney] = useState(0);
  const [dueinvoicemoney, setDueInvoiceMoney] = useState(0);
  const [openexpensemoney, setOpenExpenseMoney] = useState(0);
  const [dueexpensemoney, setDueExpenseMoney] = useState(0);

  const fetchInitials = async () => {
    try {
      const response = await window.electronAPI.getInvoiceSummary();

      if (!response || response.error) {
        const errorMessage = response?.error || 'No invoice summary returned';
        setMessage(`Error fetching summary: ${errorMessage}`);
        setShowError(true);
        return;
      }

      // Safe reads with fallbacks
      const openInv = (response.open_invoice && response.open_invoice[0] && Number(response.open_invoice[0].open_invoice)) || 0;
      const dueInv = (response.due_invoice && response.due_invoice[0] && Number(response.due_invoice[0].due_invoice)) || 0;
      const openInvMoney = (response.open_invoice && response.open_invoice[0] && Number(response.open_invoice[0].open_total_amount)) || 0;
      const dueInvMoney = (response.due_invoice && response.due_invoice[0] && Number(response.due_invoice[0].due_total_amount)) || 0;
      const openExp = (response.open_expense && response.open_expense[0] && Number(response.open_expense[0].open_expense)) || 0;
      const dueExp = (response.due_expense && response.due_expense[0] && Number(response.due_expense[0].due_expense)) || 0;
      const openExpMoney = (response.open_expense && response.open_expense[0] && Number(response.open_expense[0].open_total_amount_expense)) || 0;
      const dueExpMoney = (response.due_expense && response.due_expense[0] && Number(response.due_expense[0].due_total_amount_expense)) || 0;

      setOpenInvoice(openInv);
      setDueInvoice(dueInv);
      setOpenInvoiceMoney(openInvMoney);
      setDueInvoiceMoney(dueInvMoney);
      setOpenExpense(openExp);
      setDueExpense(dueExp);
      setOpenExpenseMoney(openExpMoney);
      setDueExpenseMoney(dueExpMoney);
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
       <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Current Cash Balance</h2>
      } >  
      <Row>
      <Col span={24}>
      <div className="ant-row-flex">
            <h1 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">${formattedNumber((openinvoicemoney || 0) - (openexpensemoney || 0))}</h1>
            <p className="gx-text-grey">Includes paid and pending transactions</p>
          </div>
        </Col>
              
      </Row><hr/>
      <Widget
      title={
        <div style={{display: 'flex', alignItems: 'center'}}>
  <div>
   <img src={Money} height={65} width={65} alt="Money"/>  </div>
  <div style={{marginLeft: '16px'}}>
    <h2 style={{marginRight: '8px', marginBottom: 0, fontSize: 'xx-large', fontWeight: 400}}>Money In</h2>
    <p style={{color: 'grey'}}>This Month</p>
  </div>
</div>      
      } 
      extra={     
        <h3 className="gx-mr-4 h3 gx-text-primary gx-font-weight-medium gx-fs-xxl"> ${formattedNumber(dueinvoicemoney)}</h3>      
}> 
<Row>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="ant-row-flex" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p className="gx-text-grey h2">Overdue invoices ({dueinvoice}) </p></div>
          <div><h4 className="gx-mr-2 h4 gx-mb-0 gx-fs-xl gx-font-weight-medium">${formattedNumber(dueinvoicemoney)}</h4></div>
        </div>
        <span className="gx-text-primary gx-pointer" ><i className="icon icon-card gx-fs-sm gx-mr-2"/><Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}>View</Link></span> 
           <hr/>     
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="ant-row-flex" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p className="gx-text-grey h2">Open invoices ({openinvoice}) </p></div>
          <div><h4 className="gx-mr-2 h4 gx-mb-0 gx-fs-xl gx-font-weight-medium">${formattedNumber(openinvoicemoney)}</h4></div>
        </div> 
        <span className="gx-text-primary gx-pointer" ><i className="icon icon-card gx-fs-sm gx-mr-2"/><Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}>View</Link></span> 
        <hr/>        
        </Col>
        </Row>
     
        </Widget>
        <Widget
      title={
        <div style={{display: 'flex', alignItems: 'center'}}>
  <div>
   <img src={MoneyOut} height={65} width={65} alt="Money"/>  </div>
  <div style={{marginLeft: '16px'}}>
    <h2 style={{marginRight: '8px', marginBottom: 0, fontSize: 'xx-large', fontWeight: 400}}>Money Out</h2>
    <p style={{color: 'grey'}}>This Month</p>
  </div>
</div>      
      } 
      extra={     
        <h3 className="gx-mr-4 h3 gx-text-primary gx-font-weight-medium gx-fs-xxl"> ${formattedNumber(dueexpensemoney)}</h3>      
}> 
<Row>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="ant-row-flex" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p className="gx-text-grey h2">Overdue bills ({dueexpense}) </p></div>
          <div><h4 className="gx-mr-2 h4 gx-mb-0 gx-fs-xl gx-font-weight-medium">${formattedNumber(dueexpensemoney)}</h4></div>
        </div>
        <span className="gx-text-primary gx-pointer" ><i className="icon icon-card gx-fs-sm gx-mr-2"/><Link to={{ pathname: "/inner/expenses", state: { tabKey: "2" } }}>View paid bills</Link></span> 
           <hr/>     
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
        <div className="ant-row-flex" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p className="gx-text-grey h2">Open bills ({openexpense}) </p></div>
          <div><h4 className="gx-mr-2 h4 gx-mb-0 gx-fs-xl gx-font-weight-medium">${formattedNumber(openexpensemoney)}</h4></div>
        </div> 
        <span className="gx-text-primary gx-pointer" ><i className="icon icon-card gx-fs-sm gx-mr-2"/><Link to={{ pathname: "/inner/expenses", state: { tabKey: "1" } }}>New bill</Link></span> 
        <hr/>        
        </Col>
        </Row>
     
        </Widget>
      </Widget>
    </Auxiliary>
  );
};

export default CashFlowTab;
