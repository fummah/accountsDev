import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Table,
  Typography,
  Row,
  Col,
} from "antd";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const { Title } = Typography;
const { Option } = Select;

const PlanningBudgeting = () => {
  const [form] = Form.useForm();
  const [budgets, setBudgets] = useState([]);

  const onFinish = (values) => {
    const newBudget = {
      key: budgets.length + 1,
      ...values,
    };
    (async () => {
      try {
        // Persist to backend
        const res = await window.electronAPI.insertBudget(values.department, values.period, values.amount, values.forecast, 'system');
        if (res && res.success) {
          newBudget.id = res.id;
        }
        setBudgets(prev => [{ key: newBudget.key, department: newBudget.department, period: newBudget.period, amount: newBudget.amount, forecast: newBudget.forecast, id: newBudget.id }, ...prev]);
        form.resetFields();
      } catch (err) {
        console.error('Error saving budget', err);
      }
    })();
  };

  useEffect(() => {
    const loadBudgets = async () => {
      try {
        const response = await window.electronAPI.getBudgets();
        if (Array.isArray(response)) {
          const mapped = response.map((b, idx) => ({ key: b.id || idx + 1, ...b }));
          setBudgets(mapped);
        }
      } catch (err) {
        console.error('Error loading budgets', err);
      }
    };
    loadBudgets();
  }, []);

  const columns = [
    {
      title: "Department",
      dataIndex: "department",
      key: "department",
    },
    {
      title: "Period",
      dataIndex: "period",
      key: "period",
    },
    {
      title: "Budget Amount",
      dataIndex: "amount",
      key: "amount",
      render: (text) => `R ${Number(text).toFixed(2)}`,
    },
    {
      title: "Forecast",
      dataIndex: "forecast",
      key: "forecast",
      render: (text) => `R ${Number(text).toFixed(2)}`,
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Title level={3}>Planning & Budgeting</Title>

      <Row gutter={16}>
        <Col xs={24} md={10}>
          <Card title="Setup Budget">
            <Form layout="vertical" form={form} onFinish={onFinish}>
              <Form.Item
                label="Department / Category"
                name="department"
                rules={[{ required: true, message: "Please enter department" }]}
              >
                <Input placeholder="e.g. Marketing, Operations, R&D" />
              </Form.Item>

              <Form.Item
                label="Budget Period"
                name="period"
                rules={[{ required: true, message: "Please select period" }]}
              >
                <Select placeholder="Select Period">
                  <Option value="Monthly">Monthly</Option>
                  <Option value="Quarterly">Quarterly</Option>
                  <Option value="Yearly">Yearly</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Budget Amount ($USD)"
                name="amount"
                rules={[{ required: true, message: "Please enter amount" }]}
              >
                <InputNumber
                  prefix="$"
                  min={0}
                  style={{ width: "100%" }}
                  placeholder="e.g. 50000"
                />
              </Form.Item>

              <Form.Item
                label="Forecast (optional)"
                name="forecast"
              >
                <InputNumber
                  prefix="$"
                  min={0}
                  style={{ width: "100%" }}
                  placeholder="e.g. 60000"
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Add Budget
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={14}>
          <Card title="Budget Overview Table">
            <Table
              dataSource={budgets}
              columns={columns}
              pagination={{ pageSize: 5 }}
              scroll={{ x: true }}
            />
          </Card>

          {budgets.length > 0 && (
            <Card title="Budget Allocation (Graph)" style={{ marginTop: 16 }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={budgets}>
                  <XAxis dataKey="department" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#1890ff" name="Budget" />
                  <Bar dataKey="forecast" fill="#82ca9d" name="Forecast" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default PlanningBudgeting;
