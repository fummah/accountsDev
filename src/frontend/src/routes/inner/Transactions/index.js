import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import ReceiptsTab from "./Tabs/ReceiptsTab";
import ReconcileTab from "./Tabs/ReconcileTab";
import Auxiliary from "util/Auxiliary";

const TabPane = Tabs.TabPane;

const Transactions = () => {
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
          
          <TabPane tab="Reconcile" key="1">
            <div className="gx-mb-2">
            <ReconcileTab/>
            </div>
          </TabPane>
    
        </Tabs>
       </Col>
       </Row>

    </Auxiliary>
  );
};

export default Transactions;
