import React, {useContext} from "react";
import Widget from "components/Widget";
import { Typography, Divider } from "antd";
import {TypeContext} from "appContext/TypeContext.js";
import InvoicePDF from "components/Inner/Sales/Invoices/InvoicePDF";

const { Title, Text } = Typography;


const Totals = ({detail}) => {
  console.log(detail);
  const type = useContext(TypeContext);
  let totalAmount = detail?.lines?.reduce((total, line) => total + (line.amount || 0) * (line.quantity || 0), 0);
  totalAmount = totalAmount + (totalAmount*(detail?.vat/100));

  return (
    <Widget 
    extra ={
      <span className="gx-link gx-mr-3">
        <InvoicePDF invoice={detail} type={type} />      
    </span>
    }    
    styleName="gx-card-profile-sm">
      <div style={{ padding: "16px", border: "1px solid #f0f0f0", borderRadius: "8px", maxWidth: "300px" }}>
      {/* Total Due */}
      <div style={{ marginBottom: "16px" }}>
        <Text type="secondary" style={{ fontSize: "14px" }}>
          Total due
        </Text>
        <Title level={2} style={{ margin: "0", color: "#000" }}>
          USD {totalAmount} <sup style={{ fontSize: "16px" }}>00</sup>
        </Title>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <Text type="secondary" style={{ fontSize: "14px" }}>
          Inc Vat
        </Text>
        <Title level={4} style={{ margin: "0", color: "#000" }}>
         {detail?.vat}%
        </Title>
      </div>

      <Divider style={{ margin: "8px 0" }} />

      <div style={{ marginBottom: "8px" }}>
        <Text type="secondary" style={{ fontSize: "14px" }}>
          {type} date
        </Text>
        <div style={{ fontSize: "16px" }}>{detail?.start_date}</div>
      </div>

      {/* Due Date */}
      <div>
        <Text type="secondary" style={{ fontSize: "14px" }}>
          Due date
        </Text>
        <div style={{ fontSize: "16px" }}>{detail?.last_date}</div>
      </div>
    </div>
    </Widget>
  )
}

export default Totals;
