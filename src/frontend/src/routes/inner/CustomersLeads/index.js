import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import CustomersTab from "./Tabs/CustomersTab";
import StatementsTab from "./Tabs/StatementsTab";
import ReceivePaymentsTab from "./Tabs/ReceivePaymentsTab";
import IncomeTrackerTab from "./Tabs/IncomeTrackerTab";
import Auxiliary from "util/Auxiliary";

const TabPane = Tabs.TabPane;

const CustomersLeads = () => {
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
       <Tabs className='gx-tabs-left' 
       activeKey={activeKey}
       onChange={(key) => setActiveKey(key)}
       >
          <TabPane tab="Customers" key="1">
            <div className="gx-mb-2">
             <CustomersTab/>
            </div>
          </TabPane>
             <TabPane tab="Statements" key="2">
            <div className="gx-mb-2">
             <StatementsTab/>
            </div>
          </TabPane>

            <TabPane tab="Receive Payments" key="3">
            <div className="gx-mb-2">
             <ReceivePaymentsTab/>
            </div>
          </TabPane>

            <TabPane tab="Income Tracker" key="4">
            <div className="gx-mb-2">
             <IncomeTrackerTab/>
            </div>
          </TabPane>
          
        </Tabs>
       </Col>

       
       </Row>

    </Auxiliary>
  );
};

export default CustomersLeads;
