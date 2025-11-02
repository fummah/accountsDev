import React, {useState, useEffect} from "react";
import { useLocation, useHistory } from "react-router-dom";
import {Col, Row,Tabs} from "antd";
import Auxiliary from "util/Auxiliary";
import Xarrow from "react-xarrows";

const Flow = () => {
  const location = useLocation();
  const history = useHistory();
  // Default tab key
  const [activeKey, setActiveKey] = useState("1");

  // Update tab key from location state
  useEffect(() => {
    if (location.state && location.state.tabKey) {
      setActiveKey(location.state.tabKey);
    }
  }, [location.state]);

  const items = [
    { id: "products", icon: "/assets/icons/products.svg", label: "Products", x: 0, y: 0 },
    { id: "expenses", icon: "/assets/icons/invoice.svg", label: "Expenses", x: 1, y: 0 },
    { id: "bills", icon: "/assets/icons/pay.svg", label: "Pay Bills", x: 2, y: 0 },
    { id: "analysis", icon: "/assets/icons/analysis.svg", label: "Analysis", x: 3, y: 0 },
  
    { id: "sales", icon: "/assets/icons/track.svg", label: "Create Sales", x: 1, y: 1 },
    { id: "cash", icon: "/assets/icons/expenses.svg", label: "Cash Receipts", x: 2, y: 1 },
    { id: "reports", icon: "/assets/icons/statement.svg", label: "Reports", x: 3, y: 1 },
  
    { id: "quotes", icon: "/assets/icons/quotes.svg", label: "Quotes", x: 0, y: 2 },
    { id: "invoice", icon: "/assets/icons/invoices.svg", label: "Create Invoice", x: 1, y: 2 },
    { id: "payments", icon: "/assets/icons/payments.svg", label: "Payments", x: 2, y: 2 },
    { id: "deposits", icon: "/assets/icons/bills.svg", label: "Deposits", x: 3, y: 2 },

    { id: "employee", icon: "/assets/icons/employee.svg", label: "Create Employee", x: 1, y: 3 },
    { id: "payroll", icon: "/assets/icons/payroll.svg", label: "Payroll", x: 2, y: 3 },
    { id: "reconcile", icon: "/assets/icons/refund.svg", label: "Reconcile", x: 3, y: 3 },
  ];
  
  const arrows = [
    ["products", "expenses"],
    ["products", "quotes"],
    ["expenses", "bills"],
    ["bills", "analysis"],
    
    ["quotes", "invoice"],
    ["invoice", "payments"],
    ["sales", "invoice"],
    ["sales", "cash"],
    ["cash", "reports"],
    ["reports", "analysis"],

    ["cash", "payments"],
    ["payments", "deposits"],
    ["deposits", "reports"],
    ["deposits", "reconcile"],
    ["reconcile", "deposits"],
    ["employee", "payroll"],
    ["payments", "payroll"],
    ["payroll", "reconcile"],
  ];

  const routeMap = {
    products: "/inner/sales",
    bills: "/inner/expenses",
    payment: "/inner/expenses",
    analysis: "/inner/reports",
    sales: "/inner/sales",
    cash: "/inner/expenses",
    reports: "/inner/reports",
    quotes: "/inner/sales",
    invoice: "/inner/sales",
    payments: "/inner/expenses",
    deposits: "/inner/sales",
    payroll: "/inner/employees",
    employee: "/inner/employees",
    reconcile: "/inner/transactions",
  };
  const WorkflowNode = ({ id, icon, label, x, y,onClick }) => (
    <div
      id={id}
      onClick={onClick}
      className="workflow-node"
      style={{
        top: `${y * 140}px`,
        left: `${x * 200}px`,
        position: "absolute",
        width: "80px",
        height: "70px",
        padding: "10px",
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <img src={icon} alt={label} className="w-10 h-10 mb-2" />
      <span className="text-center text-sm">{label}</span>
    </div>
  );
  

  return (
    <Auxiliary>
     <Row justify="center" align="middle" style={{ minHeight: "9vh" }}>
  <Col>
    <div
      className="relative bg-gray-100 p-10 overflow-auto"
      style={{
        width: "860px",
        height: "450px",
        position: "relative"
      }}
    >
      {items.map((item) => (
        <WorkflowNode key={item.id} {...item} onClick={() => history.push(routeMap[item.id])}/>
      ))}
      {arrows.map(([start, end], idx) => (
        <Xarrow key={idx} start={start} end={end} strokeWidth={2} headSize={6} />
      ))}
    </div>
  </Col>
</Row>


    </Auxiliary>
  );
};

export default Flow;
