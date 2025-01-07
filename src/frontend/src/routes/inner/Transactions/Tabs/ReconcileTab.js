import React,{useState} from "react";
import {Col, Row, Table, Button, Modal, Tag, Input} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";

const ReconcileTab = () => {
  const [bankTransactions, setBankTransactions] = useState([
    { id: 1, date: "2025-01-01", description: "Deposit", amount: 1000, matched: false },
    { id: 2, date: "2025-01-03", description: "Withdrawal", amount: -500, matched: false },
    { id: 3, date: "2025-01-05", description: "Transfer", amount: -200, matched: false },
  ]);

  // Mock data for recorded transactions
  const [recordedTransactions, setRecordedTransactions] = useState([
    { id: 101, date: "2025-01-01", description: "Deposit", amount: 1000, matched: false },
    { id: 102, date: "2025-01-02", description: "Bill Payment", amount: -300, matched: false },
    { id: 103, date: "2025-01-03", description: "Withdrawal", amount: -500, matched: false },
  ]);

  // Modal state for reconciliation
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedBankTransaction, setSelectedBankTransaction] = useState(null);

  // Match a transaction
  const matchTransaction = (recordedTransactionId) => {
    setBankTransactions((prev) =>
      prev.map((tx) =>
        tx.id === selectedBankTransaction.id ? { ...tx, matched: true } : tx
      )
    );
    setRecordedTransactions((prev) =>
      prev.map((tx) =>
        tx.id === recordedTransactionId ? { ...tx, matched: true } : tx
      )
    );
    setIsModalVisible(false);
  };

  // Columns for Bank Transactions Table
  const bankColumns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => (
        <span style={{ color: amount > 0 ? "green" : "red" }}>
          {amount.toFixed(2)}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "matched",
      key: "matched",
      render: (matched) =>
        matched ? <Tag color="green">Matched</Tag> : <Tag color="red">Unmatched</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) =>
        !record.matched && (
          <Button
            type="primary"
            onClick={() => {
              setSelectedBankTransaction(record);
              setIsModalVisible(true);
            }}
          >
            Reconcile
          </Button>
        ),
    },
  ];

  // Columns for Recorded Transactions Table
  const recordedColumns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => (
        <span style={{ color: amount > 0 ? "green" : "red" }}>
          {amount.toFixed(2)}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "matched",
      key: "matched",
      render: (matched) =>
        matched ? <Tag color="green">Matched</Tag> : <Tag color="red">Unmatched</Tag>,
    },
  ];

  return (
    <Auxiliary> 
       <Widget>  
      <Row>
      <Col span={24}>
      <div>
      <h2>Bank Reconciliation</h2>
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        {/* Bank Transactions Table */}
        <div style={{ flex: 1 }}>
          <h3>Bank Transactions</h3>
          <Table
            columns={bankColumns}
            dataSource={[]/*bankTransactions*/}
            rowKey="id"
            pagination={false}
          />
        </div>

        {/* Recorded Transactions Table */}
        <div style={{ flex: 1 }}>
          <h3>Recorded Transactions</h3>
          <Table
            columns={recordedColumns}
            dataSource={[]/*recordedTransactions*/}
            rowKey="id"
            pagination={false}
          />
        </div>
      </div>

      {/* Modal for Reconciliation */}
      <Modal
        title="Reconcile Transaction"
        visible={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <p>
          <strong>Bank Transaction:</strong>{" "}
          {`${selectedBankTransaction?.description} (${selectedBankTransaction?.amount.toFixed(
            2
          )})`}
        </p>
        <h4>Select a matching recorded transaction:</h4>
        {recordedTransactions
          .filter((tx) => !tx.matched)
          .map((tx) => (
            <div key={tx.id} style={{ marginBottom: "10px" }}>
              <Button
                type="dashed"
                onClick={() => matchTransaction(tx.id)}
                style={{ width: "100%" }}
              >
                {`${tx.description} (${tx.amount.toFixed(2)})`}
              </Button>
            </div>
          ))}
      </Modal>
    </div>
        </Col>
              
      </Row><hr/>
      
      </Widget>
    </Auxiliary>
  );
};

export default ReconcileTab;
