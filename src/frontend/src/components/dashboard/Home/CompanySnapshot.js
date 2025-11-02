import React from "react";
import { Card, Col, Row, Typography } from "antd";
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

// Dummy Data
const revenueData = [
  { month: "Jan", revenue: 12000 },
  { month: "Feb", revenue: 15000 },
  { month: "Mar", revenue: 18000 },
  { month: "Apr", revenue: 17000 },
  { month: "May", revenue: 22000 },
  { month: "Jun", revenue: 19000 },
];

const expenseData = [
  { month: "Jan", expenses: 9000 },
  { month: "Feb", expenses: 10000 },
  { month: "Mar", expenses: 14000 },
  { month: "Apr", expenses: 13000 },
  { month: "May", expenses: 16000 },
  { month: "Jun", expenses: 15000 },
];

const CompanySnapshot = () => {
  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Company Snapshot</Title>

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
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1890ff"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Expense Overview">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="expenses" fill="#f5222d" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card>
            <Text type="secondary">Total Revenue</Text>
            <Title level={2}>R96,000</Title>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card>
            <Text type="secondary">Total Expenses</Text>
            <Title level={2}>R69,000</Title>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card>
            <Text type="secondary">Net Profit</Text>
            <Title level={2} type="success">
              R27,000
            </Title>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CompanySnapshot;
