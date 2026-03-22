import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import AllSalesTab from "./Tabs/AllSalesTab";
import InvoicesTab from "./Tabs/InvoicesTab";
import QuotesTab from "./Tabs/QuotesTab";
import CustomersTab from "../CustomersLeads/Tabs/CustomersTab";
import ProductsTab from "./Tabs/ProductsTab";
import CreateStatement from "../../../components/customers/statements/CreateStatement";
import ReceivePayments from "../../../components/customers/payments/ReceivePayments";
import IncomeTracker from "../../../components/customers/IncomeTracker";
import RecurringTransactions from "../../../components/customers/RecurringTransactions";
import ItemList from "../../../components/customers/ItemList";
import Auxiliary from "util/Auxiliary";

const TabPane = Tabs.TabPane;

const Sales = () => {
  const location = useLocation();

  // Default tab key
  const [activeKey, setActiveKey] = useState("1");

  // Update tab key from location state or query param (supports deep links like /inner/sales?tab=2)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromQuery = params.get('tab');
    if (tabFromQuery) {
      setActiveKey(tabFromQuery);
      return;
    }
    if (location.state && location.state.tabKey) {
      setActiveKey(location.state.tabKey);
    }
  }, [location.search, location.state]);
  return (
    <Auxiliary>
    <Row>
      <Col span={24}>
        <Tabs
          className="gx-tabs-left"
          activeKey={activeKey}
          onChange={(key) => setActiveKey(key)}
          destroyInactiveTabPane
          animated={false}
        >
          <TabPane tab="All Sales" key="1">
            <div className="gx-mb-2">
              <AllSalesTab />
            </div>
          </TabPane>
          <TabPane tab="Invoices" key="2">
            <div className="gx-mb-2">
              <InvoicesTab />
            </div>
          </TabPane>
          <TabPane tab="Quotes" key="3">
            <div className="gx-mb-2">
              <QuotesTab />
            </div>
          </TabPane>
           <TabPane tab="Customers" key="9">
            <div className="gx-mb-2">
              <CustomersTab />
            </div>
          </TabPane>
          <TabPane tab="Products and Services" key="10">
            <div className="gx-mb-2">
              <ProductsTab />
            </div>
          </TabPane>
          <TabPane tab="Statements" key="4">
            <div className="gx-mb-2">
              <CreateStatement />
            </div>
          </TabPane>
          <TabPane tab="Receive Payments" key="5">
            <div className="gx-mb-2">
              <ReceivePayments />
            </div>
          </TabPane>
          <TabPane tab="Income Tracker" key="6">
            <div className="gx-mb-2">
              <IncomeTracker />
            </div>
          </TabPane>
          <TabPane tab="Recurring Transactions" key="7">
            <div className="gx-mb-2">
              <RecurringTransactions />
            </div>
          </TabPane>
          <TabPane tab="Item List" key="8">
            <div className="gx-mb-2">
              <ItemList />
            </div>
          </TabPane>
         
        </Tabs>
      </Col>
    </Row>
  </Auxiliary>
  );
};

export default Sales;
