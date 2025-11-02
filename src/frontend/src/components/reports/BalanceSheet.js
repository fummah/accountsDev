import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Row, Col, Statistic } from 'antd';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const BalanceSheet = () => {
  const [date, setDate] = useState(moment());
  const [loading, setLoading] = useState(false);
  const [balanceSheet, setBalanceSheet] = useState({
    assets: [],
    liabilities: [],
    equity: [],
    summary: {
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0
    }
  });

  useEffect(() => {
    if (date) {
      loadBalanceSheet();
    }
  }, [date]);

  const loadBalanceSheet = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getBalanceSheet(date.format('YYYY-MM-DD'));
      setBalanceSheet(data);
    } catch (error) {
      console.error('Failed to load balance sheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const assetColumns = [
    {
      title: 'Asset Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const liabilityColumns = [
    {
      title: 'Liability Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const equityColumns = [
    {
      title: 'Equity Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Balance Sheet</h2>
        <div>
          <DatePicker 
            value={date}
            onChange={setDate}
            style={{ marginRight: '16px' }}
          />
          <Button icon={<PrinterOutlined />} style={{ marginRight: '8px' }}>
            Print
          </Button>
          <Button icon={<DownloadOutlined />}>
            Export
          </Button>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Assets"
              value={balanceSheet.summary.totalAssets}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Liabilities"
              value={balanceSheet.summary.totalLiabilities}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Equity"
              value={balanceSheet.summary.totalEquity}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Assets" className="balance-sheet-card">
            <Table
              columns={assetColumns}
              dataSource={balanceSheet.assets}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Assets</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${balanceSheet.summary.totalAssets.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
        
        <Col span={12}>
          <Card title="Liabilities" className="balance-sheet-card">
            <Table
              columns={liabilityColumns}
              dataSource={balanceSheet.liabilities}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Liabilities</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${balanceSheet.summary.totalLiabilities.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>

          <Card title="Equity" className="balance-sheet-card" style={{ marginTop: '16px' }}>
            <Table
              columns={equityColumns}
              dataSource={balanceSheet.equity}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Equity</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${balanceSheet.summary.totalEquity.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>

      <style jsx>{`
        .balance-sheet-card {
          margin-bottom: 16px;
        }
        .balance-sheet-card :global(.ant-card-body) {
          padding: 0;
        }
      `}</style>
    </div>
  );
};

export default BalanceSheet;