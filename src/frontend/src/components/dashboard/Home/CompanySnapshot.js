import React, { useEffect, useState } from "react";
import { Card, Col, Row, Typography, Spin } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

const { Title, Text } = Typography;

const CompanySnapshot = ({ summary: summaryProp }) => {
  const [loading, setLoading] = useState(!summaryProp);
  const [revenueData, setRevenueData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [totals, setTotals] = useState({ totalRevenue: 0, totalExpenses: 0, netProfit: 0 });

  useEffect(() => {
    let mounted = true;

    const applySummary = (response) => {
      if (!response || response.error) return;
      const monthly = Array.isArray(response.monthlyPerformance) ? response.monthlyPerformance.slice().reverse() : [];
      const months = monthly.map(m => {
        const label = m.month || m.name || '';
        let monthLabel = label;
        if (/^\d{4}-\d{2}$/.test(label)) {
          const parts = label.split('-');
          const date = new Date(parts[0], Number(parts[1]) - 1, 1);
          monthLabel = date.toLocaleString(undefined, { month: 'short' });
        }
        return { month: monthLabel, revenue: Number(m.revenue) || 0 };
      });
      const expenseAnalysis = Array.isArray(response.expenseAnalysis) ? response.expenseAnalysis : (Array.isArray(response.expenselist) ? response.expenselist : []);
      const expenseBars = expenseAnalysis.slice(0, 6).map(item => ({ category: item.name || item.category || '', value: Number(item.value || item.amount || 0) }));
      const totalExpenses = expenseAnalysis.reduce((s, it) => s + (Number(it.value) || 0), 0);
      const totalRevenue = monthly.reduce((s, it) => s + (Number(it.revenue) || 0), 0);
      const netProfit = totalRevenue - totalExpenses;
      if (mounted) {
        setRevenueData(months);
        setExpenseData(expenseBars);
        setTotals({ totalRevenue, totalExpenses, netProfit });
      }
    };

    if (summaryProp) {
      setLoading(false);
      applySummary(summaryProp);
      return () => { mounted = false; };
    }

    setLoading(true);
    const fetchSummary = async () => {
      try {
        const response = await window.electronAPI.getDashboardSummary();
        if (!mounted) return;
        if (!response || response.error) {
          setLoading(false);
          return;
        }
        applySummary(response);
      } catch (error) {
        console.error('Error fetching dashboard summary for CompanySnapshot:', error);
        if (mounted) setLoading(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchSummary();
    return () => { mounted = false; };
  }, [summaryProp]);

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Company Snapshot</Title>

      {loading ? (
        <Spin />
      ) : (
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card title="Revenue Overview">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#1890ff" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title="Expense Overview">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={expenseData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#f5222d" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Text type="secondary">Total Revenue</Text>
              <Title level={2}>R{Number(totals.totalRevenue || 0).toLocaleString()}</Title>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Text type="secondary">Total Expenses</Text>
              <Title level={2}>R{Number(totals.totalExpenses || 0).toLocaleString()}</Title>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Text type="secondary">Net Profit</Text>
              <Title level={2} type={totals.netProfit >= 0 ? "success" : "danger"}>
                R{Number(totals.netProfit || 0).toLocaleString()}
              </Title>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default CompanySnapshot;
