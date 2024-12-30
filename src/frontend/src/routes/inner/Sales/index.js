import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import AllSalesTab from "./Tabs/AllSalesTab";
import InvoicesTab from "./Tabs/InvoicesTab";
import QuotesTab from "./Tabs/QuotesTab";
import CustomersTab from "../CustomersLeads/Tabs/CustomersTab";
import ProductsTab from "./Tabs/ProductsTab";
import Auxiliary from "util/Auxiliary";

const TabPane = Tabs.TabPane;

const Sales = () => {
  const location = useLocation();

  // Default tab key
  const [activeKey, setActiveKey] = useState("1");

  // Update tab key from location state
  useEffect(() => {
    if (location.state && location.state.tabKey) {
      setActiveKey(location.state.tabKey);
    }
  }, [location.state]);
  return (
    <Auxiliary>
    <Row>
      <Col span={24}>
        <Tabs
          className="gx-tabs-left"
          activeKey={activeKey}
          onChange={(key) => setActiveKey(key)}
        >
          <TabPane tab="All Sales" key="1">
            <div className="gx-mb-2">
            <CustomersTab />
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
          <TabPane tab="Customers" key="4">
            <div className="gx-mb-2">
              <CustomersTab />
            </div>
          </TabPane>
          <TabPane tab="Products and Services" key="5">
            <div className="gx-mb-2">
              <ProductsTab />
            </div>
          </TabPane>
        </Tabs>
      </Col>
    </Row>
  </Auxiliary>
  );
};

export default Sales;
