import React from 'react';
import Widget from "components/Widget/index";
import { Typography, Row, Col, Progress } from 'antd';

const { Text } = Typography; 
const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};

const InvoicesCard = ({Report,title='1'}) => {
  return (
    <Widget
    title={
      title === '1' ? (
        <h2 class="h4 gx-text-capitalize gx-mb-0">INVOICES</h2>
      ) : null
    }
    >
    <div style={{paddingRight:20,paddingLeft:20}}>
      <Row justify="space-between" className='gx-mr-5 gx-mb-3'>
        <Text>
          <Text className='h4' strong>${formattedNumber(Report?.open_invoice[0].open_total_amount)} Unpaid</Text> <Text type="secondary">Last 365 days</Text>
        </Text>
      </Row>

      {/* Overdue and Not Due Yet amounts */}
      <Row justify="space-between">
        <Col>
          <Text strong>${formattedNumber(Report?.due_invoice[0].due_total_amount)}</Text>
          <br />
          <Text type="secondary">Overdue</Text>
        </Col>
        <Col>
          <Text strong>${formattedNumber(Report?.open_invoice[0].open_total_amount - Report?.due_invoice[0].due_total_amount)}</Text>
          <br />
          <Text type="secondary">Not due yet</Text>
        </Col>
      </Row>

      {/* Progress Bar */}
      <Progress
        percent={0}
        showInfo={false}
        strokeColor="#d9d9d9"
        style={{ marginBottom: '20px' }}
      />

      {/* Paid Section */}
      <Row justify="space-between" className='gx-mr-5 gx-mb-3'>
        <Text>
          <Text className='h4' strong>${formattedNumber(Report?.paid_invoice[0].paid_total_amount)} Paid</Text> <Text type="secondary">Last 30 days</Text>
        </Text>
      </Row>

      {/* Not Deposited and Deposited amounts */}
      <Row justify="space-between">
        <Col>
          <Text strong>R0</Text>
          <br />
          <Text type="secondary">Not deposited</Text>
        </Col>
        <Col>
          <Text strong>${formattedNumber(Report?.open_invoice[0].open_total_amount)}</Text>
          <br />
          <Text type="secondary">Deposited</Text>
        </Col>
      </Row>

      {/* Green Progress Bars */}
      <Row justify="">
        <Col span={12}>
          <Progress
            percent={100}
            showInfo={false}
            strokeColor="#A6EB42"
            trailColor="transparent"
            strokeWidth={15}
          />
        </Col>
        <Col span={12}>
          <Progress
            percent={100}
            showInfo={false}
            strokeColor="#31B96E"
            trailColor="transparent"
            strokeWidth={15}
          />
        </Col>
      </Row>
    </div>
    </Widget>
  );
};

export default InvoicesCard;
