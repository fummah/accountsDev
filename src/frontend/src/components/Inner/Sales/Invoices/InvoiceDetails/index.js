import React, {useContext, useState, useEffect} from "react";
import {Row, Col} from "antd";
import Overview from "./Overview";
import LineItems from "./LineItems";
import Totals from "./Totals";
import Messages from "./Messages";
import Auxiliary from "util/Auxiliary";
import {TypeContext} from "appContext/TypeContext.js";

const InvoiceDetails = ({ id, setMessage, setShowError, onConvertToInvoice }) => {
  const type = useContext(TypeContext);
  const [detail, setDetail] = useState(null);
    

  const fetchDetails = async () => {
    try { 
        const response = type === "Quote"?await window.electronAPI.getSingleQuote(id):await window.electronAPI.getSingleInvoice(id);          
        setDetail(response);
    } catch (error) {
      setMessage("Error fetching:", error);
      setShowError(true);
    }
};

const handleConvert = () => {
  console.log(id)
  onConvertToInvoice(id);
};


useEffect(() => {
  fetchDetails();
}, []);
  return (
    <Auxiliary>
    <div className="gx-profile-content">
      <Row>
        <Col xl={16} lg={14} md={14} sm={24} xs={24}>
          <Overview detail={detail} handleConvert = {handleConvert}/>
          <LineItems lines={detail?.lines}/>
        </Col>

        <Col xl={8} lg={10} md={10} sm={24} xs={24}>       
          <Totals detail={detail}/>
          <Row>
            <Col xl={24} lg={24} md={24} sm={12} xs={24}>
            <Messages message={detail?.message} statement_message={detail?.statement_message}/>
            </Col>
            
          </Row>
        </Col>
      </Row>
    
    </div>
  </Auxiliary>
  );
};

export default InvoiceDetails;
