import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Select, Row, Col, Statistic } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const { RangePicker } = DatePicker;
const { Option } = Select;

const IncomeTracker = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [statistics, setStatistics] = useState({
    totalIncome: 0,
    averageIncome: 0,
    outstandingAmount: 0
  });

  useEffect(() => {
    fetchTransactions();
  }, [dateRange, period]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const startDate = dateRange[0]?.toISOString();
      const endDate = dateRange[1]?.toISOString();
      
      const data = await window.electronAPI.getIncomeTransactions({
        startDate,
        endDate,
        period
      });
      
      const tx = Array.isArray(data.transactions) ? data.transactions.map(t => ({
        ...t,
        amount: Number(t.amount || 0),
      })) : [];
      setTransactions(tx);
      setStatistics({
        totalIncome: Number(data.totalIncome || 0),
        averageIncome: Number(data.averageIncome || 0),
        outstandingAmount: Number(data.outstandingAmount || 0)
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName'
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${Number(amount || 0).toFixed(2)}`
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status'
    }
  ];

const chartData = transactions.map(t => ({
  date: t?.date ? new Date(t.date).toLocaleDateString() : '',
  amount: Number(t.amount || 0)
}));

  return (
    <Card title="Income Tracker">
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Statistic 
            title="Total Income" 
            value={statistics.totalIncome} 
            prefix="$"
            precision={2}
          />
        </Col>
        <Col span={8}>
          <Statistic 
            title="Average Income" 
            value={statistics.averageIncome}
            prefix="$"
            precision={2}
          />
        </Col>
        <Col span={8}>
          <Statistic 
            title="Outstanding Amount" 
            value={statistics.outstandingAmount}
            prefix="$"
            precision={2}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <RangePicker
            style={{ width: '100%' }}
            onChange={(dates) => setDateRange(dates)}
          />
        </Col>
        <Col span={12}>
          <Select
            style={{ width: '100%' }}
            value={period}
            onChange={(value) => setPeriod(value)}
          >
            <Option value="daily">Daily</Option>
            <Option value="weekly">Weekly</Option>
            <Option value="monthly">Monthly</Option>
            <Option value="yearly">Yearly</Option>
          </Select>
        </Col>
      </Row>

      <div style={{ marginBottom: 24, height: 300 }}>
        <LineChart
          width={800}
          height={300}
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="amount" stroke="#8884d8" />
        </LineChart>
      </div>

      <Table
        columns={columns}
        dataSource={transactions}
        loading={loading}
        rowKey="id"
      />
    </Card>
  );
};

export default IncomeTracker;
