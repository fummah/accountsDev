import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import CustomersTab from "./Tabs/CustomersTab";
import Auxiliary from "util/Auxiliary";
import CreateStatement from "../../../components/customers/statements/CreateStatement";
import ReceivePayments from "../../../components/customers/payments/ReceivePayments";
import IncomeTracker from "../../../components/customers/IncomeTracker";

const TabPane = Tabs.TabPane;

const CustomersLeads = () => {
  const location = useLocation();

  // Get initial tab key from location.state or query params or default to "1"
  const getInitialTab = () => {
    if (location.state?.tabKey) return location.state.tabKey;
    const params = new URLSearchParams(location.search);
    return params.get('tab') || "1";
  };

  const [activeKey, setActiveKey] = useState(getInitialTab());

  // Handle tab change
  const onTabChange = (key) => {
    setActiveKey(key);
  };

  return (
    <Auxiliary>
      <Row>
        <Col span={24}>
          <Tabs 
            defaultActiveKey="1"
            activeKey={activeKey}
            onChange={onTabChange}
            destroyInactiveTabPane={true}
          >
            <TabPane tab="Customers" key="1">
              {activeKey === "1" && (
                <div className="gx-mb-2">
                  <CustomersTab/>
                </div>
              )}
            </TabPane>
            
            <TabPane tab="Statements" key="2">
              {activeKey === "2" && (
                <div className="gx-mb-2">
                  <CreateStatement/>
                </div>
              )}
            </TabPane>

            <TabPane tab="Receive Payments" key="3">
              {activeKey === "3" && (
                <div className="gx-mb-2">
                  <ReceivePayments/>
                </div>
              )}
            </TabPane>

            <TabPane tab="Income Tracker" key="4">
              {activeKey === "4" && (
                <div className="gx-mb-2">
                  <IncomeTracker/>
                </div>
              )}
            </TabPane>
          </Tabs>
        </Col>
      </Row>
    </Auxiliary>
  );
};

export default CustomersLeads;
