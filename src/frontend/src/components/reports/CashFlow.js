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
      // Use unified financial report API and extract cashFlow
      const report = await window.electronAPI.getFinancialReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );
      const data = report && report.cashFlow ? report.cashFlow : null;
      if (data) setCashFlowData(data);
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
    data: Array.isArray(cashFlowData?.trends) ? cashFlowData.trends : [],
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

  const summary = cashFlowData && cashFlowData.summary ? cashFlowData.summary : {
    operatingCashFlow: 0,
    investingCashFlow: 0,
    financingCashFlow: 0,
    netCashFlow: 0,
    openingBalance: 0,
    closingBalance: 0
  };
  const num = (v) => Number(v || 0);

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
          <Button icon={<PrinterOutlined />} style={{ marginRight: '8px' }} onClick={() => {
            try {
              const w = window.open('', '_blank');
              const rows = cashFlowData.details.map(r => `<tr><td>${r.period}</td><td>${r.revenue.toFixed(2)}</td><td>${r.investments.toFixed(2)}</td><td>${r.otherInflows.toFixed(2)}</td><td>${r.operatingExpenses.toFixed(2)}</td><td>${r.capex.toFixed(2)}</td><td>${r.otherOutflows.toFixed(2)}</td><td>${r.netCashFlow.toFixed(2)}</td><td>${r.closingBalance.toFixed(2)}</td></tr>`).join('');
              const html = `<!doctype html><html><head><title>Cash Flow</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}</style></head><body><h2>Cash Flow Analysis</h2><p>Period: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')}</p><table><thead><tr><th>Period</th><th>Revenue</th><th>Investments</th><th>Other Inflows</th><th>Operating Expenses</th><th>Capex</th><th>Other Outflows</th><th>Net</th><th>Closing</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
              w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
            } catch (e) { /* noop */ }
          }}>
            Print
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => {
            try {
              const headers = ['period','revenue','investments','otherInflows','operatingExpenses','capex','otherOutflows','netCashFlow','closingBalance'];
              const rows = cashFlowData.details.map(r => headers.map(h => `"${(r[h] ?? 0).toString().replace(/"/g,'""')}"`).join(','));
              const csv = [headers.join(','), ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cash_flow_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            } catch (e) { /* noop */ }
          }}>
            Export
          </Button>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Operating Cash Flow"
              value={num(summary.operatingCashFlow)}
              precision={2}
              prefix="$"
              valueStyle={{ color: num(summary.operatingCashFlow) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Investing Cash Flow"
              value={num(summary.investingCashFlow)}
              precision={2}
              prefix="$"
              valueStyle={{ color: num(summary.investingCashFlow) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Financing Cash Flow"
              value={num(summary.financingCashFlow)}
              precision={2}
              prefix="$"
              valueStyle={{ color: num(summary.financingCashFlow) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Net Cash Flow"
              value={num(summary.netCashFlow)}
              precision={2}
              prefix="$"
              valueStyle={{ color: num(summary.netCashFlow) >= 0 ? '#3f8600' : '#cf1322' }}
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
          dataSource={Array.isArray(cashFlowData?.details) ? cashFlowData.details.map(r => ({
            ...r,
            revenue: num(r.revenue),
            investments: num(r.investments),
            otherInflows: num(r.otherInflows),
            operatingExpenses: num(r.operatingExpenses),
            capex: num(r.capex),
            otherOutflows: num(r.otherOutflows),
            netCashFlow: num(r.netCashFlow),
            closingBalance: num(r.closingBalance),
          })) : []}
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