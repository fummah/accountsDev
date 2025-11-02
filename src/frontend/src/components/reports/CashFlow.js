import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Row, Col, Statistic, Select } from 'antd';
import { Line } from '@ant-design/charts';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const CashFlow = () => {
  const [dateRange, setDateRange] = useState([
    moment().startOf('year'),
    moment().endOf('year')
  ]);
  const [periodicity, setPeriodicity] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [cashFlowData, setCashFlowData] = useState({
    summary: {
      operatingCashFlow: 0,
      investingCashFlow: 0,
      financingCashFlow: 0,
      netCashFlow: 0,
      openingBalance: 0,
      closingBalance: 0
    },
    details: [],
    trends: []
  });

  useEffect(() => {
    if (dateRange) {
      loadCashFlowData();
    }
  }, [dateRange, periodicity]);

  const loadCashFlowData = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getCashFlowReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD'),
        periodicity
      );
      setCashFlowData(data);
    } catch (error) {
      console.error('Failed to load cash flow data:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Period',
      dataIndex: 'period',
      key: 'period',
    },
    {
      title: 'Cash Inflows',
      children: [
        {
          title: 'Revenue',
          dataIndex: 'revenue',
          key: 'revenue',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
        {
          title: 'Investments',
          dataIndex: 'investments',
          key: 'investments',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
        {
          title: 'Other Inflows',
          dataIndex: 'otherInflows',
          key: 'otherInflows',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
      ],
    },
    {
      title: 'Cash Outflows',
      children: [
        {
          title: 'Operating Expenses',
          dataIndex: 'operatingExpenses',
          key: 'operatingExpenses',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
        {
          title: 'Capital Expenditure',
          dataIndex: 'capex',
          key: 'capex',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
        {
          title: 'Other Outflows',
          dataIndex: 'otherOutflows',
          key: 'otherOutflows',
          render: (amount) => `$${amount.toFixed(2)}`,
        },
      ],
    },
    {
      title: 'Net Cash Flow',
      dataIndex: 'netCashFlow',
      key: 'netCashFlow',
      render: (amount) => {
        const color = amount >= 0 ? '#3f8600' : '#cf1322';
        return <span style={{ color }}>${amount.toFixed(2)}</span>;
      },
    },
    {
      title: 'Closing Balance',
      dataIndex: 'closingBalance',
      key: 'closingBalance',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const config = {
    data: cashFlowData.trends,
    xField: 'period',
    yField: 'value',
    seriesField: 'type',
    xAxis: {
      type: 'time',
    },
    yAxis: {
      label: {
        formatter: (v) => `$${v}`,
      },
    },
    legend: {
      position: 'top',
    },
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Cash Flow Analysis</h2>
        <div>
          <RangePicker 
            value={dateRange}
            onChange={setDateRange}
            style={{ marginRight: '16px' }}
          />
          <Select
            value={periodicity}
            onChange={setPeriodicity}
            style={{ width: 120, marginRight: '16px' }}
          >
            <Option value="daily">Daily</Option>
            <Option value="weekly">Weekly</Option>
            <Option value="monthly">Monthly</Option>
            <Option value="quarterly">Quarterly</Option>
          </Select>
          <Button icon={<PrinterOutlined />} style={{ marginRight: '8px' }}>
            Print
          </Button>
          <Button icon={<DownloadOutlined />}>
            Export
          </Button>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Operating Cash Flow"
              value={cashFlowData.summary.operatingCashFlow}
              precision={2}
              prefix="$"
              valueStyle={{ color: cashFlowData.summary.operatingCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Investing Cash Flow"
              value={cashFlowData.summary.investingCashFlow}
              precision={2}
              prefix="$"
              valueStyle={{ color: cashFlowData.summary.investingCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Financing Cash Flow"
              value={cashFlowData.summary.financingCashFlow}
              precision={2}
              prefix="$"
              valueStyle={{ color: cashFlowData.summary.financingCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Net Cash Flow"
              value={cashFlowData.summary.netCashFlow}
              precision={2}
              prefix="$"
              valueStyle={{ color: cashFlowData.summary.netCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Cash Flow Trends" style={{ marginBottom: '24px' }}>
        <Line {...config} />
      </Card>

      <Card title="Detailed Cash Flow Statement">
        <Table 
          columns={columns} 
          dataSource={cashFlowData.details}
          rowKey="period"
          loading={loading}
          pagination={false}
          scroll={{ x: true }}
        />
      </Card>
    </div>
  );
};

export default CashFlow;