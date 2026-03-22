import React, {useState, useEffect} from "react";
import { useLocation } from "react-router-dom";
import {Col, Row, Tabs} from "antd";
import HomeTab from "./Tabs/HomeTab";
import CashFlowTab from "./Tabs/CashFlowTab";
import Auxiliary from "util/Auxiliary";

const { TabPane } = Tabs;

const Home = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tabFromQuery = searchParams.get('tab');

  // Initialize with query param, location state, or default
  const [activeKey, setActiveKey] = useState(() => {
    if (tabFromQuery) return tabFromQuery;
    if (location.state?.tabKey) return location.state.tabKey;
    return "1";
  });

  // Update tab key when location changes
  useEffect(() => {
    if (tabFromQuery) {
      setActiveKey(tabFromQuery);
    } else if (location.state?.tabKey) {
      setActiveKey(location.state.tabKey);
    }
  }, [location, tabFromQuery]);

  const handleTabChange = (key) => {
    setActiveKey(key);
  };

  const renderTabContent = (key) => {
    switch (key) {
      case "1":
        return <HomeTab />;
      case "2":
        return <CashFlowTab />;
      default:
        return null;
    }
  };

  return (
    <Auxiliary>
      <Row>
        <Col span={24}>
          <Tabs 
            className='gx-tabs-left' 
            activeKey={activeKey}
            onChange={handleTabChange}
            destroyInactiveTabPane={true}
          >
            <TabPane tab="Home" key="1">
              {activeKey === "1" && (
                <div className="gx-mb-2">
                  {renderTabContent("1")}
                </div>
              )}
            </TabPane>
            <TabPane tab="Cash Flow" key="2">
              {activeKey === "2" && (
                <div className="gx-mb-2">
                  {renderTabContent("2")}
                </div>
              )}
            </TabPane>
          </Tabs>
        </Col>
      </Row>
    </Auxiliary>
  );
};

export default Home;
