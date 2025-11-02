import React, { useState, useEffect } from "react";
import { Button, Modal, Form, Input, InputNumber, Select, DatePicker, Table, Tabs, message } from "antd";
import { PlusOutlined, StopOutlined, HistoryOutlined } from "@ant-design/icons";

const { Option } = Select;
const { TabPane } = Tabs;



const TransactionsCenter = () => {
  const [transactions, setTransactions] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("1");
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load transactions from backend
  const loadTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.getTransactions();
      if (Array.isArray(data)) {
        setTransactions(data.map((t, idx) => ({
          key: t.id || idx,
          date: t.date,
          type: t.type,
          amount: t.amount,
          description: t.description,
          status: t.status,
        })));
      } else {
        setTransactions([]);
      }
    } catch (e) {
      setError('Failed to load transactions');
      setTransactions([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const showModal = () => setIsModalVisible(true);
  const handleCancel = () => {
    form.resetFields();
    setIsModalVisible(false);
  };

  const handleAddTransaction = async (values) => {
    try {
      await window.electronAPI.insertTransaction({
        date: values.date.format("YYYY-MM-DD"),
        type: values.type,
        amount: values.amount,
        description: values.description,
        entered_by: 'system',
      });
      await loadTransactions();
      message.success("Transaction added successfully.");
    } catch (e) {
      setError('Failed to add transaction');
    }
    handleCancel();
  };

  const handleVoid = async (key) => {
    try {
      await window.electronAPI.voidTransaction(key);
      await loadTransactions();
      message.warning("Transaction voided.");
    } catch (e) {
      setError('Failed to void transaction');
    }
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date"
    },
    {
      title: "Type",
      dataIndex: "type"
    },
    {
      title: "Amount",
      dataIndex: "amount"
    },
    {
      title: "Description",
      dataIndex: "description"
    },
    {
      title: "Status",
      dataIndex: "status"
    },
    {
      title: "Actions",
      render: (_, record) =>
        record.status !== "Voided" && (
          <Button icon={<StopOutlined />} onClick={() => handleVoid(record.key)} danger>
            Void
          </Button>
        )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Transactions</h2>
      {error && <div style={{ color: 'red', margin: 8 }}>{error}</div>}
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane
          tab={
            <span>
              <PlusOutlined /> Enter Transaction
            </span>
          }
          key="1"
        >
          <Button type="primary" onClick={showModal} icon={<PlusOutlined />}>
            New Transaction
          </Button>
        </TabPane>
        <TabPane
          tab={
            <span>
              <HistoryOutlined /> View History
            </span>
          }
          key="2"
        >
          <Table columns={columns} dataSource={transactions} loading={loading} />
        </TabPane>
      </Tabs>
      <Modal
        title="Enter New Transaction"
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
      >
        <Form layout="vertical" form={form} onFinish={handleAddTransaction}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="type" label="Transaction Type" rules={[{ required: true }]}>
            <Select placeholder="Select type">
              <Option value="Income">Income</Option>
              <Option value="Expense">Expense</Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Save Transaction
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TransactionsCenter;
