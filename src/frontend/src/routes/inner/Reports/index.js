import React, {useState, useEffect} from "react";
import {Col, Row,Tabs} from "antd";
import Auxiliary from "util/Auxiliary";
import { useLocation } from "react-router-dom";
import FinancialReportTab from "./Tabs/FinancialReportTab";
import ManagementReportTab from "./Tabs/ManagementReportTab";
import TaxReportTab from "./Tabs/TaxReportTab";

const TabPane = Tabs.TabPane;

const Reports = () => {
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
          <TabPane tab="Financial Reports" key="1">
            <div className="gx-mb-2">
             <FinancialReportTab/>
            </div>
          </TabPane>
                 <TabPane tab="Management Reports" key="2">
            <div className="gx-mb-2">
            <ManagementReportTab/>
            </div>
          </TabPane>

          <TabPane tab="Tax Reports" key="3">
            <div className="gx-mb-2">
            <TaxReportTab/>
            </div>
          </TabPane>
         
        </Tabs>
       </Col>
       </Row>

    </Auxiliary>
  );
};

export default Reports;
