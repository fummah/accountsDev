import React from "react";
import {FireOutlined, CreditCardOutlined, UnorderedListOutlined} from '@ant-design/icons';

const WelComeCard = ({UnpaidInvoices, DueQuotes, DuePayments}) => {
  return (
    <div className="gx-wel-ema gx-pt-xl-2">
      <h1 className="gx-mb-3">Welcome Demo!</h1>
      <p className="gx-fs-sm gx-text-uppercase">You Have</p>
      <ul className="gx-list-group">
        <li>
          <FireOutlined/>

          <span>{UnpaidInvoices} Unpaid Invoices</span>
        </li>
        <li>
          <CreditCardOutlined/>
          <span>{DueQuotes} Due Quotes</span>
        </li>
        <li>
          <UnorderedListOutlined/>
          <span>{DuePayments} Due Payments</span>
        </li>
       
      </ul>
    </div>
  );
};

export default WelComeCard;
