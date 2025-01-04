import React from "react";
import {Col, Row} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";


const formarty = (value) =>{
  return `$${value.toLocaleString()}`;
}

const BalanceSheetSection = ({data}) => {
  return (
    <Auxiliary> 
       <Widget >  
      <Row>
      <Col span={24}>
      <div>
      <h2>Balance Sheet</h2>
      <h3>Assets</h3>
      <ul>
        <li>Cash: {formarty(data.assets.cash)}</li>
        <li>Accounts Receivable: {formarty(data.assets.accountsReceivable)}</li>
        <li>Inventory: {formarty(data.assets.inventory)}</li>
        <li>Total Assets: {formarty(data.assets.total)}</li>
      </ul>
      <h3>Liabilities</h3>
      <ul>
        <li>Accounts Payable: {formarty(data.liabilities.accountsPayable)}</li>
        <li>Short-Term Debt: {formarty(data.liabilities.shortTermDebt)}</li>
        <li>Total Liabilities: {formarty(data.liabilities.total)}</li>
      </ul>
      <h3>Equity</h3>
      <ul>
        <li>Retained Earnings: {formarty(data.equity.retainedEarnings)}</li>
        <li>Shareholder Equity: {formarty(data.equity.shareholderEquity)}</li>
        <li>Total Equity: {formarty(data.equity.total)}</li>
      </ul>
    </div>

        </Col>
              
      </Row>
      
      </Widget>
    </Auxiliary>
  );
};

export default BalanceSheetSection;
