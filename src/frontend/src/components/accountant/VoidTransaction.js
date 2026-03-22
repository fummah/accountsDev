import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert, Table, message } from 'antd';

const VoidTransaction = () => {
  const [form] = Form.useForm();
  const [searchResult, setSearchResult] = useState(null);
  const [voided, setVoided] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSearch = async (values) => {
    try {
      setLoading(true);
      const all = await window.electronAPI.getTransactions();
      const id = String(values.transactionId).trim();
      const match = Array.isArray(all) ? all.find(t => String(t.id) === id || String(t.reference || '').trim() === id) : null;
      if (!match) {
        setSearchResult(null);
        message.warning('Transaction not found');
        return;
      }
      setSearchResult({
        id: match.id,
        transactionId: match.id,
        date: match.date,
        type: match.type,
        amount: (Number(match.amount || match.debit || 0) || 0).toFixed(2),
        description: match.description || '',
        status: match.status || 'Active',
        reference: match.reference || '',
      });
    } catch (e) {
      message.error('Failed to search transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async () => {
    try {
      if (!searchResult || !searchResult.id) return;
      setLoading(true);
      const res = await window.electronAPI.voidTransaction(searchResult.id);
      if (res && (res.changes > 0 || res.success !== false)) {
        setVoided(true);
        setSearchResult({ ...searchResult, status: 'Voided' });
        message.success('Transaction voided');
      } else {
        throw new Error(res?.error || 'Void failed');
      }
    } catch (e) {
      message.error(e.message || 'Failed to void transaction');
    } finally {
      setLoading(false);
      setTimeout(() => setVoided(false), 3000);
    }
  };

  const columns = [
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
  ];

  return (
    <Card title="Void Transaction">
      {voided && (
        <Alert
          message="Transaction voided successfully"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      <Form
        form={form}
        layout="vertical"
        onFinish={onSearch}
        style={{ marginBottom: 24 }}
      >
        <Form.Item
          name="transactionId"
          label="Transaction ID or Reference"
          rules={[{ required: true, message: 'Please enter transaction ID or reference' }]}
        >
          <Input placeholder="Enter transaction ID or Reference" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            Search Transaction
          </Button>
        </Form.Item>
      </Form>

      {searchResult && (
        <>
          <Table
            columns={columns}
            dataSource={[searchResult]}
            pagination={false}
            style={{ marginBottom: 16 }}
            rowKey="transactionId"
          />
          <Button type="primary" danger onClick={handleVoid} disabled={(searchResult.status || '').toLowerCase() === 'voided'} loading={loading}>
            Void Transaction
          </Button>
        </>
      )}
    </Card>
  );
};

export default VoidTransaction;