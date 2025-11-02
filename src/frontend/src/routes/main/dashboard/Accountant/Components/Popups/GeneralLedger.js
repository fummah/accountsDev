import React, { useState, useEffect } from "react";
import { Card, Table, Tabs, Button, Space } from "antd";
import { FileSearchOutlined, PrinterOutlined } from "@ant-design/icons";

const { TabPane } = Tabs;

const GeneralLedger = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const ledger = await window.electronAPI.getLedger();
      if (Array.isArray(ledger)) {
        setData(ledger.map((entry, idx) => ({
          key: idx,
          date: entry.date,
          account: entry.account,
          description: entry.description,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          balance: entry.balance || 0,
        })));
      } else {
        setData([]);
      }
    } catch (e) {
      setError('Failed to load ledger');
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLedger();
  }, []);

const columns = [
  {
    title: "Date",
    dataIndex: "date",
    key: "date",
  },
  {
    title: "Account",
    dataIndex: "account",
    key: "account",
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
  },
  {
    title: "Debit",
    dataIndex: "debit",
    key: "debit",
    render: (text) => `R${text.toFixed(2)}`,
  },
  {
    title: "Credit",
    dataIndex: "credit",
    key: "credit",
    render: (text) => `R${text.toFixed(2)}`,
  },
  {
    title: "Balance",
    dataIndex: "balance",
    key: "balance",
    render: (text) => `R${text.toFixed(2)}`,
  },
];

  return (
    <Card
      title="General Ledger"
      extra={
        <Space>
          <Button icon={<FileSearchOutlined />}>Search Entries</Button>
          <Button icon={<PrinterOutlined />}>Print</Button>
        </Space>
      }
    >
      {error && <div style={{ color: 'red', margin: 8 }}>{error}</div>}
      <Tabs defaultActiveKey="1">
        <TabPane tab="All Accounts" key="1">
          <Table columns={columns} dataSource={data} pagination={{ pageSize: 5 }} loading={loading} />
        </TabPane>
        <TabPane tab="Cash" key="2">
          <Table
            columns={columns}
            dataSource={data.filter((item) => item.account === "Cash")}
            pagination={{ pageSize: 5 }}
            loading={loading}
          />
        </TabPane>
        <TabPane tab="Accounts Receivable" key="3">
          <Table
            columns={columns}
            dataSource={data.filter((item) => item.account === "Accounts Receivable")}
            pagination={{ pageSize: 5 }}
            loading={loading}
          />
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default GeneralLedger;
