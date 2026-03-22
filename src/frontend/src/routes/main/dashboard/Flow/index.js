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

  const P = (p) => (process.env.PUBLIC_URL + p);
  const items = [
    { id: "products", icon: P("/assets/icons/products.svg"), label: "Products", x: 0, y: 0 },
    { id: "expenses", icon: P("/assets/icons/invoice.svg"), label: "Expenses", x: 1, y: 0 },
    { id: "bills", icon: P("/assets/icons/pay.svg"), label: "Pay Bills", x: 2, y: 0 },
    { id: "analysis", icon: P("/assets/icons/analysis.svg"), label: "Analysis", x: 3, y: 0 },
  
    { id: "sales", icon: P("/assets/icons/track.svg"), label: "Create Sales", x: 1, y: 1 },
    { id: "cash", icon: P("/assets/icons/expenses.svg"), label: "Cash Receipts", x: 2, y: 1 },
    { id: "reports", icon: P("/assets/icons/statement.svg"), label: "Reports", x: 3, y: 1 },
  
    { id: "quotes", icon: P("/assets/icons/quotes.svg"), label: "Quotes", x: 0, y: 2 },
    { id: "invoice", icon: P("/assets/icons/invoices.svg"), label: "Create Invoice", x: 1, y: 2 },
    { id: "payments", icon: P("/assets/icons/payments.svg"), label: "Payments", x: 2, y: 2 },
    { id: "deposits", icon: P("/assets/icons/bills.svg"), label: "Deposits", x: 3, y: 2 },

    { id: "employee", icon: P("/assets/icons/employee.svg"), label: "Create Employee", x: 1, y: 3 },
    { id: "payroll", icon: P("/assets/icons/payroll.svg"), label: "Payroll", x: 2, y: 3 },
    { id: "reconcile", icon: P("/assets/icons/refund.svg"), label: "Reconcile", x: 3, y: 3 },
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
    // direct mappings — include query params to open specific tabs where applicable
    products: "/inner/sales?tab=10",
    bills: "/inner/expenses",
    payment: "/inner/expenses",
    analysis: "/inner/reports?tab=1",
    sales: "/inner/sales?tab=1",
    cash: "/inner/sales?tab=6", // Cash Receipts -> Income Tracker
    reports: "/inner/reports?tab=1",
    quotes: "/inner/sales?tab=3",
    invoice: "/inner/sales?tab=2",
    payments: "/inner/sales?tab=5",
    deposits: "/main/banking/deposits",
    payroll: "/main/employees/payroll",
    employee: "/main/employees/center",
    reconcile: "/inner/transactions",
    expenses: "/inner/expenses",
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
