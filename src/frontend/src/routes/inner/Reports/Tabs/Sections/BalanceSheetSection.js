import React from "react";
import {Col, Row, Table} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";

const fmt = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BalanceSheetSection = ({data}) => {
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const liabilities = Array.isArray(data?.liabilities) ? data.liabilities : [];
  const equity = Array.isArray(data?.equity) ? data.equity : [];
  const summary = data?.summary || {};

  const columns = [
    { title: 'Account', dataIndex: 'name', key: 'name' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right',
      render: v => fmt(v) },
  ];

  return (
    <Auxiliary> 
       <Widget>  
      <Row>
      <Col span={24}>
      <div>
      <h2>Balance Sheet</h2>
      <h3>Assets</h3>
      {assets.length > 0 ? (
        <Table dataSource={assets.map((a,i) => ({...a, key:i}))} columns={columns} pagination={false} size="small" />
      ) : <p style={{color:'#999'}}>No asset accounts with activity</p>}
      <div style={{textAlign:'right', fontWeight:'bold', margin:'4px 0 12px'}}>Total Assets: {fmt(summary.totalAssets)}</div>

      <h3>Liabilities</h3>
      {liabilities.length > 0 ? (
        <Table dataSource={liabilities.map((a,i) => ({...a, key:i}))} columns={columns} pagination={false} size="small" />
      ) : <p style={{color:'#999'}}>No liability accounts with activity</p>}
      <div style={{textAlign:'right', fontWeight:'bold', margin:'4px 0 12px'}}>Total Liabilities: {fmt(summary.totalLiabilities)}</div>

      <h3>Equity</h3>
      {equity.length > 0 ? (
        <Table dataSource={equity.map((a,i) => ({...a, key:i}))} columns={columns} pagination={false} size="small" />
      ) : <p style={{color:'#999'}}>No equity accounts with activity</p>}
      <div style={{textAlign:'right', fontWeight:'bold', margin:'4px 0 12px'}}>Total Equity: {fmt(summary.totalEquity)}</div>
    </div>
        </Col>
      </Row>
      </Widget>
    </Auxiliary>
  );
};

export default BalanceSheetSection;
