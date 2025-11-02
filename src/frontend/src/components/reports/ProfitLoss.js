import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Statistic, Row, Col } from 'antd';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;

const ProfitLoss = () => {
  const [dateRange, setDateRange] = useState([
    moment().startOf('year'),
    moment().endOf('year')
  ]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    income: [],
    expenses: [],
    summary: {
      totalIncome: 0,
      totalExpenses: 0,
      netIncome: 0
    }
  });

  useEffect(() => {
    if (dateRange) {
      loadProfitLoss();
    }
  }, [dateRange]);

  const loadProfitLoss = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getFinancialReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );
      // Backend returns an object with profitLoss, balanceSheet, cashFlow
      // Map backend shape to the UI shape expected here.
      const profit = result && result.profitLoss ? result.profitLoss : null;
      if (profit) {
        const mapped = {
          income: [
            { category: 'Revenue', amount: Number(profit.revenue || 0) }
          ],
          expenses: [
            { category: 'COGS', amount: Number(profit.cogs || 0) },
            { category: 'Operating Expenses', amount: Number(profit.operatingExpenses || 0) }
          ],
          summary: {
            totalIncome: Number(profit.revenue || 0),
            totalExpenses: Number(profit.operatingExpenses || 0),
            netIncome: Number(profit.netProfit != null ? profit.netProfit : ((profit.revenue || 0) - (profit.product_total_amount || 0) - (profit.operatingExpenses || 0)))
          }
        };
        setData(mapped);
      } else {
        // fallback to empty structured data
        setData({ income: [], expenses: [], summary: { totalIncome: 0, totalExpenses: 0, netIncome: 0 } });
      }
    } catch (error) {
      console.error('Failed to load profit & loss data:', error);
    } finally {
      setLoading(false);
    }
  };

  const incomeColumns = [
    {
      title: 'Income Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: '% of Total',
      dataIndex: 'amount',
      key: 'percentage',
      render: (amount) => {
        const total = (data && data.summary && Number(data.summary.totalIncome)) || 0;
        if (!total) return '0%';
        return `${((Number(amount || 0) / total) * 100).toFixed(1)}%`;
      }
    }
  ];

  const expenseColumns = [
    {
      title: 'Expense Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: '% of Total',
      dataIndex: 'amount',
      key: 'percentage',
      render: (amount) => {
        const total = (data && data.summary && Number(data.summary.totalExpenses)) || 0;
        if (!total) return '0%';
        return `${((Number(amount || 0) / total) * 100).toFixed(1)}%`;
      }
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Profit & Loss Statement</h2>
        <div>
          <RangePicker 
            value={dateRange}
            onChange={setDateRange}
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
              title="Total Income"
              value={data.summary.totalIncome}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Expenses"
              value={data.summary.totalExpenses}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Net Income"
              value={data.summary.netIncome}
              precision={2}
              prefix="$"
              valueStyle={{ color: data.summary.netIncome >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Income" style={{ marginBottom: '24px' }}>
        <Table
          columns={incomeColumns}
          dataSource={data.income}
          rowKey="category"
          loading={loading}
          pagination={false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>Total Income</Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                ${data.summary.totalIncome.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>100%</Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      <Card title="Expenses">
        <Table
          columns={expenseColumns}
          dataSource={data.expenses}
          rowKey="category"
          loading={loading}
          pagination={false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>Total Expenses</Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                ${data.summary.totalExpenses.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>100%</Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
};

export default ProfitLoss;