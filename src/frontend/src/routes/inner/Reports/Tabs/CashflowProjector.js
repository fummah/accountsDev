import React, { useState, useEffect } from "react";
import { message } from 'antd';
import {
  Card,
  Table,
  InputNumber,
  Select,
  Button,
  Typography,
  Row,
  Col,
} from "antd";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

const { Title } = Typography;
const { Option } = Select;

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const initialData = months.map(month => ({
  month,
  inflow: 0,
  outflow: 0,
}));

export default function CashflowProjector() {
  const [cashflowData, setCashflowData] = useState(initialData);

  useEffect(() => {
    const load = async () => {
      try {
        const year = new Date().getFullYear();
        const response = await window.electronAPI.getCashflowProjections(year);
        if (Array.isArray(response) && response.length > 0) {
          // map response to months order
          const mapped = months.map(m => {
            const found = response.find(r => r.month === m);
            return {
              month: m,
              inflow: found ? Number(found.inflow) : 0,
              outflow: found ? Number(found.outflow) : 0,
            };
          });
          setCashflowData(mapped);
        }
      } catch (err) {
        console.error('Error loading cashflow projections', err);
      }
    };
    load();
  }, []);

  const updateValue = (index, key, value) => {
    const updated = [...cashflowData];
    updated[index][key] = value;
    setCashflowData(updated);
  };

  const columns = [
    {
      title: "Month",
      dataIndex: "month",
      key: "month",
    },
    {
      title: "Projected Inflow",
      dataIndex: "inflow",
      key: "inflow",
      render: (value, _, index) => (
        <InputNumber
          value={value}
          min={0}
          formatter={val => `$ ${val}`}
          parser={val => val.replace(/[^\d]/g, "")}
          onChange={val => updateValue(index, "inflow", val)}
        />
      ),
    },
    {
      title: "Projected Outflow",
      dataIndex: "outflow",
      key: "outflow",
      render: (value, _, index) => (
        <InputNumber
          value={value}
          min={0}
          formatter={val => `$ ${val}`}
          parser={val => val.replace(/[^\d]/g, "")}
          onChange={val => updateValue(index, "outflow", val)}
        />
      ),
    },
  ];

  const chartData = cashflowData.map(item => ({
    month: item.month,
    NetCashflow: item.inflow - item.outflow,
  }));

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Cashflow Projector</Title>
      <Row gutter={[24, 24]}>
        <Col xs={24} md={14}>
          <Card title="Monthly Cashflow Input">
            <Table
              columns={columns}
              dataSource={cashflowData}
              rowKey="month"
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Projected Net Cashflow Chart">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={value => `$ ${value}`} />
                <Line
                  type="monotone"
                  dataKey="NetCashflow"
                  stroke="#1890ff"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
      <Row justify="end" style={{ marginTop: 24 }}>
        <Button type="primary" onClick={async () => {
          try {
              const year = new Date().getFullYear();
              const result = await window.electronAPI.saveCashflowProjections(cashflowData, year);
              if (result && result.success) {
                message.success('Projections saved');
              } else {
                message.error('Failed to save projections');
              }
            } catch (err) {
              console.error('Error saving projections', err);
              message.error('Error saving projections');
            }
        }}>
          Save Projections
        </Button>
      </Row>
    </div>
  );
}
