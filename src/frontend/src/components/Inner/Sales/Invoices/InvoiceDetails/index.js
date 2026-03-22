import React, {useContext, useState, useEffect} from "react";
import {Row, Col, Button, message} from "antd";
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

  const computeTotal = () => {
    if (!detail) return 0;
    const lines = Array.isArray(detail.lines) ? detail.lines : [];
    const sub = lines.reduce((s, l) => {
      const qty = Number(l.quantity || 1);
      const amt = Number(l.amount || l.rate || 0);
      return s + qty * amt;
    }, 0);
    const vatPct = Number(detail.vat || 0);
    const vatAmt = sub * (vatPct / 100);
    return Number((sub + vatAmt).toFixed(2));
  };

  const handlePayNow = async () => {
    try {
      if (!detail || !id) return;
      const total = computeTotal();
      const res = await window.electronAPI.payLinkCreate({ invoiceId: id, amount: total });
      if (res?.redirectUrl) {
        window.open(res.redirectUrl, '_blank');
        message.success('Opening secure payment page...');
      } else {
        message.info('Payment link created.');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to create payment link');
    }
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
            <Col xl={24} lg={24} md={24} sm={12} xs={24} style={{ marginTop: 12 }}>
              <Button type="primary" onClick={handlePayNow} block>
                Pay Now
              </Button>
            </Col>
          </Row>
        </Col>
      </Row>
    
    </div>
  </Auxiliary>
  );
};

export default InvoiceDetails;
