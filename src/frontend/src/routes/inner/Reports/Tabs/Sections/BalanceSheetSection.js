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
        <li>Cash: {formarty(data?.assets.cash || 0)}</li>
        <li>Accounts Receivable: {formarty(data?.assets.accountsReceivable || 0)}</li>
        <li>Inventory: {formarty(data?.assets.inventory || 0)}</li>
        <li>Total Assets: {formarty(data?.assets.total || 0)}</li>
      </ul>
      <h3>Liabilities</h3>
      <ul>
        <li>Accounts Payable: {formarty(data?.liabilities.accountsPayable || 0)}</li>
        <li>Short-Term Debt: {formarty(data?.liabilities.shortTermDebt || 0)}</li>
        <li>Total Liabilities: {formarty(data?.liabilities.total || 0)}</li>
      </ul>
      <h3>Equity</h3>
      <ul>
        <li>Retained Earnings: {formarty(data?.equity.retainedEarnings || 0)}</li>
        <li>Shareholder Equity: {formarty(data?.equity.shareholderEquity || 0)}</li>
        <li>Total Equity: {formarty(data?.equity.total || 0)}</li>
      </ul>
    </div>

        </Col>
              
      </Row>
      
      </Widget>
    </Auxiliary>
  );
};

export default BalanceSheetSection;
