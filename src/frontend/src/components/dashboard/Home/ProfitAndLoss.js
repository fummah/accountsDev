import React,{useState} from "react";
import {Link} from "react-router-dom";
import Widget from "components/Widget/index";
import {Button, Col, Row,Select,Typography, Avatar} from "antd";
import LineIndicator from "./LineIndicator";
import { FileTextOutlined, WalletOutlined } from '@ant-design/icons';

const Option = Select.Option;
const { Text } = Typography;

const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};


const ProfitAndLoss = ({CurrentBalance, Invoiced, Expensed}) => {

 
  const perc1 = Math.round((Invoiced/Invoiced)*100);
  const perc2 = Math.round((Expensed/Invoiced)*100);

  const IconButton = ({ icon, text }) => {
    return (
      <div style={{ textAlign: 'center' }}>
        <Button
          shape="circle"
          size="large"
          style={{
            width: '50px',            
            height: '50px',
            border: '1px solid #038fde',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
          className="icon-button"
        >
          <Avatar icon={icon} style={{ fontSize: '20px', color:'#038fde',backgroundColor:"transparent" }} />
        </Button>
        <Text strong style={{ display: 'block', marginTop: '10px',color:'#038fde' }}>
          {text}
        </Text>
        <style jsx>{`
        .icon-button:hover {
          background-color: #000; /* light blue background on hover */
          border-color: #038fde;
          color: #fff;
        }
        .icon-button:hover .ant-avatar {
          color: #fff; /* darker blue on hover */
        }
      `}</style>
      </div>
    );
  };
  return (
    <Widget
    title={
      <h2 className="h4 gx-text-capitalize gx-mb-0">
        Profit & Loss</h2>
    }
    extra={
      <Select className="gx-mb-2 gx-select-sm" defaultValue="10">
      <Option value="10">This Month</Option>
      <Option value="20">Last Month</Option>
    </Select>
    }>
      
      <Row>
        <Col lg={12} md={12} sm={12} xs={24}>

          <div className="ant-row-flex">
            <h2 className="gx-mr-2 gx-mb-0 gx-fs-xxxl gx-font-weight-medium">${formattedNumber(CurrentBalance)}</h2>
            <h4 className="gx-pt-2 gx-chart-up">0% <i className="icon icon-menu-up gx-fs-sm"/></h4>
          </div>
          <p className="gx-text-grey">Net profit for December</p>
          <div className="ant-row-flex gx-mb-3 gx-mb-md-2">
          <Row justify="center" gutter={50}>
      <Col>
      <Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}><IconButton icon={<FileTextOutlined />} text="Create invoice" /></Link>
      </Col>
      <Col>
      <Link to={{ pathname: "/inner/expenses", state: { tabKey: "1" } }}><IconButton icon={<WalletOutlined />} text="Record expense" /></Link>
      </Col>
    </Row>
          </div>

          <p className="gx-text-primary gx-pointer gx-d-none gx-d-sm-block gx-mb-1"></p>
        </Col>
        <Col lg={12} md={12} sm={12} xs={24}>
          <div className="gx-site-dash">
            <h5 className="gx-mb-3">Distribution</h5>
            <ul className="gx-line-indicator gx-fs-sm gx-pb-1 gx-pb-sm-0">
              <li>
                <LineIndicator width={`${perc1}%`} title="Income" title2={`$${formattedNumber(Invoiced)}`} color="primary" value={`${perc1}%`}/>
              </li>
              <li>
                <LineIndicator width={`${perc2}%`} title="Expenses" title2={`$${formattedNumber(Expensed)}`} color="pink" value={`${perc2}%`}/>
              </li>
             
            </ul>
           
          </div>
        </Col>
      </Row>
      
    </Widget>
  );
};

export default ProfitAndLoss;
