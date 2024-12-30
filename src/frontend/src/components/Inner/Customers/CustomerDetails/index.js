import React,{useState, useEffect, useContext} from "react";
import { Card, Col, Row, Tabs, Typography, Divider } from "antd";
import CustomerHeader from "./CustomerHeader";
import CustomerInfo from "./CustomerInfo";
import Invoices from "./Invoices";
import Expenses from "./Expenses";
import Auxiliary from "util/Auxiliary";
import {CategoryContext} from "appContext/TypeContext.js";

const { TabPane } = Tabs;

const CustomerDetails = ({ id,setMessage, setShowError }) => {
  const type = useContext(CategoryContext);
  const [detail, setDetail] = useState(null);
  

  const fetchDetails = async () => {
    try {    
        const response = type === "Customer" ? await window.electronAPI.getSingleCustomer(id):await window.electronAPI.getSingleSupplier(id);          
        setDetail(response);
    } catch (error) {
      setMessage("Error fetching:", error);
      setShowError(true);
    }
};

useEffect(() => {
  fetchDetails();
}, []);
  return (
    <Auxiliary>
    <div className="gx-profile-content">
    <div style={{ padding: "16px" }}>      
      <CustomerHeader detail={detail}/>

      <Card style={{ marginTop: "16px" }}>
      
        <Tabs defaultActiveKey="1">
        <TabPane tab="Customer Details" key="1">
            <CustomerInfo detail={detail}/>
          </TabPane>
          <TabPane tab="Transaction List" key="2">
            {type === "Customer" && 
            (
              <>
            <Invoices data={detail?.invoices || []} title="Invoices"/>
            <Invoices data={detail?.quotes || []} title="Quotes"/>
            </>
            )
          }
            <Expenses data={detail?.expenses || []}/>
          </TabPane>
          <TabPane tab="Statements" key="3">
            No statements
          </TabPane>
        
        </Tabs>
      </Card>
    </div>
    </div>
  </Auxiliary>
  );
};

export default CustomerDetails;
