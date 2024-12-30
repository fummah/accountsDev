import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import ExpensesTab from "./Tabs/ExpensesTab";
import SuppliersTab from "./Tabs/SuppliersTab";
import Auxiliary from "util/Auxiliary";
import {CategoryContext} from "appContext/TypeContext.js";

const TabPane = Tabs.TabPane;


const Expenses = () => {
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
    <CategoryContext.Provider value="Supplier">
    <Auxiliary>
             <Row>
       <Col span={24}>
       <Tabs className='gx-tabs-left' 
       activeKey={activeKey}
       onChange={(key) => setActiveKey(key)}
       >
          <TabPane tab="Expenses" key="1">
            <div className="gx-mb-2">
             <ExpensesTab/>
            </div>
          </TabPane>
                 <TabPane tab="Suppliers" key="2">
            <div className="gx-mb-2">
            <SuppliersTab/>
            </div>
          </TabPane>
         
        </Tabs>
       </Col>
       </Row>

    </Auxiliary>
    </CategoryContext.Provider>
  );
};

export default Expenses;
