import React from 'react';
import Widget from "components/Widget/index";
import { Typography, Row, Col, Progress } from 'antd';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography; 
const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};

const InvoicesCard = ({ Report, title = '1' }) => {
  const { symbol: cSym } = useCurrency();

  const unpaidTotal = Number(Report?.open_invoice?.[0]?.open_total_amount) || 0;
  const overdueTotal = Number(Report?.due_invoice?.[0]?.due_total_amount) || 0;
  const notDueYet = Math.max(0, unpaidTotal - overdueTotal);
  const overduePct = unpaidTotal > 0 ? Math.round((overdueTotal / unpaidTotal) * 100) : 0;

  const recentlyPaidAmt = Number(Report?.recently_paid?.[0]?.recently_paid_amount) || Number(Report?.paid_invoice?.[0]?.paid_total_amount) || 0;
  const depositedAmt = Number(Report?.deposited?.[0]?.deposited_amount) || 0;
  const notDepositedAmt = Number(Report?.not_deposited?.[0]?.not_deposited_amount) || Math.max(0, recentlyPaidAmt - depositedAmt);
  const depositedPct = recentlyPaidAmt > 0 ? Math.round((depositedAmt / recentlyPaidAmt) * 100) : 0;
  const notDepositedPct = Math.max(0, 100 - depositedPct);

  return (
    <Widget
    title={
      title === '1' ? (
        <h2 className="h4 gx-text-capitalize gx-mb-0">INVOICES</h2>
      ) : null
    }
    >
    <div style={{paddingRight:20,paddingLeft:20}}>
      <Row justify="space-between" className='gx-mr-5 gx-mb-3'>
        <Text>
          <Text className='h4' strong>{cSym}{formattedNumber(unpaidTotal)} Unpaid</Text> <Text type="secondary">Last 365 days</Text>
        </Text>
      </Row>

      {/* Overdue and Not Due Yet amounts */}
      <Row justify="space-between">
        <Col>
          <Text strong style={{ color: overdueTotal > 0 ? '#f5222d' : undefined }}>{cSym}{formattedNumber(overdueTotal)}</Text>
          <br />
          <Text type="secondary">Overdue</Text>
        </Col>
        <Col>
          <Text strong>{cSym}{formattedNumber(notDueYet)}</Text>
          <br />
          <Text type="secondary">Not due yet</Text>
        </Col>
      </Row>

      {/* Progress Bar — overdue vs not due */}
      <Progress
        percent={100}
        success={{ percent: 100 - overduePct }}
        showInfo={false}
        strokeColor="#f5222d"
        trailColor="#d9d9d9"
        style={{ marginBottom: '20px' }}
      />

      {/* Paid Section */}
      <Row justify="space-between" className='gx-mr-5 gx-mb-3'>
        <Text>
          <Text className='h4' strong>{cSym}{formattedNumber(recentlyPaidAmt)} Paid</Text> <Text type="secondary">Last 30 days</Text>
        </Text>
      </Row>

      {/* Not Deposited and Deposited amounts */}
      <Row justify="space-between">
        <Col>
          <Text strong style={{ color: notDepositedAmt > 0 ? '#faad14' : undefined }}>{cSym}{formattedNumber(notDepositedAmt)}</Text>
          <br />
          <Text type="secondary">Not deposited</Text>
        </Col>
        <Col>
          <Text strong style={{ color: '#52c41a' }}>{cSym}{formattedNumber(depositedAmt)}</Text>
          <br />
          <Text type="secondary">Deposited</Text>
        </Col>
      </Row>

      {/* Green Progress Bars — not deposited vs deposited */}
      <Row justify="">
        <Col span={notDepositedPct > 0 ? Math.max(3, Math.round(notDepositedPct * 24 / 100)) : 0}>
          {notDepositedPct > 0 && <Progress
            percent={100}
            showInfo={false}
            strokeColor="#A6EB42"
            trailColor="transparent"
            strokeWidth={15}
          />}
        </Col>
        <Col span={depositedPct > 0 ? Math.max(3, Math.round(depositedPct * 24 / 100)) : 24}>
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
