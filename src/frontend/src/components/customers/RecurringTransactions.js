import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, DatePicker, InputNumber, Select, Space, message, notification } from 'antd';
import moment from 'moment';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;

const RecurringTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchTransactions();
    // show latest reminders
    (async () => {
      try {
        const reminders = await window.electronAPI.listRecurringReminders?.(10);
        if (Array.isArray(reminders)) {
          reminders.forEach(r => {
            let details = {};
            try { details = r.details ? JSON.parse(r.details) : {}; } catch {}
            notification.info({
              message: 'Recurring Reminder',
              description: `${details.description || 'Recurring item'} due soon (next: ${details.nextDate || ''})`,
              duration: 5
            });
          });
        }
      } catch {}
    })();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getRecurringTransactions();
      setTransactions(data);
    } catch (error) {
      message.error('Failed to load recurring transactions');
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingTransaction(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingTransaction(record);
    form.setFieldsValue({
      ...record,
      nextDate: record.nextDate ? moment(record.nextDate) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteRecurringTransaction(id);
      message.success('Transaction deleted successfully');
      fetchTransactions();
    } catch (error) {
      message.error('Failed to delete transaction');
      console.error('Error deleting transaction:', error);
    }
  };

  const onFinish = async (values) => {
    try {
      // If payload is present as text, pass it through; otherwise, seed a minimal template by kind
      let payload = values.payload;
      if (!payload && values.kind) {
        const today = new Date().toISOString().slice(0,10);
        const map = {
          invoice: { customer: 1, start_date: today, last_date: today, invoiceLines: [{ product: 1, quantity: 1, amount: Number(values.amount || 0) || 0 }] },
          bill: { payee: 'Vendor', payment_date: today, expenseLines: [{ category: 'Expense', amount: Number(values.amount || 0) || 0 }] },
          journal: { date: today, description: values.description || 'Auto JE', lines: [{ account: 'Cash', debit: Number(values.amount || 0) || 0 }, { account: 'Revenue', credit: Number(values.amount || 0) || 0 }] },
          payroll: { payPeriodStart: today, payPeriodEnd: today, paymentMethod: 'Bank', bankAccount: 1, employeeIds: [] },
          generic: {}
        };
        payload = JSON.stringify(map[values.kind] || {}, null, 2);
      }

      if (editingTransaction) {
        await window.electronAPI.updateRecurringTransaction({
          id: editingTransaction.id,
          ...values,
          nextDate: values.nextDate ? values.nextDate.format('YYYY-MM-DD') : null,
          payload
        });
        message.success('Transaction updated successfully');
      } else {
        await window.electronAPI.createRecurringTransaction({
          ...values,
          nextDate: values.nextDate ? values.nextDate.format('YYYY-MM-DD') : null,
          payload
        });
        message.success('Transaction created successfully');
      }
      setModalVisible(false);
      fetchTransactions();
    } catch (error) {
      message.error('Failed to save transaction');
      console.error('Error saving transaction:', error);
    }
  };

  const columns = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Type',
      dataIndex: 'kind',
      key: 'kind',
      render: (v) => (v || 'generic')
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Frequency',
      dataIndex: 'frequency',
      key: 'frequency',
    },
    {
      title: 'Next Date',
      dataIndex: 'nextDate',
      key: 'nextDate',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button onClick={async () => {
            try {
              const res = await window.electronAPI.recurringRunNow(record.id);
              if (res && res.error) throw new Error(res.error);
              message.success('Run executed');
              fetchTransactions();
            } catch (e) {
              message.error(e?.message || 'Failed to run now');
            }
          }}>Run Now</Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="Recurring Transactions"
        extra={
          <Space>
            <Button onClick={async ()=>{ await window.electronAPI.recurringBulkPause(selectedRowKeys); message.success('Paused'); fetchTransactions(); }} disabled={selectedRowKeys.length===0}>Pause Selected</Button>
            <Button onClick={async ()=>{ await window.electronAPI.recurringBulkResume(selectedRowKeys); message.success('Resumed'); fetchTransactions(); }} disabled={selectedRowKeys.length===0}>Resume Selected</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              Add Transaction
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={transactions}
          loading={loading}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          rowKey="id"
        />
      </Card>

      <Modal
        title={editingTransaction ? 'Edit Transaction' : 'New Transaction'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true, message: 'Please enter amount' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item name="kind" label="Type">
            <Select>
              <Option value="invoice">Invoice</Option>
              <Option value="bill">Bill</Option>
              <Option value="journal">Journal</Option>
              <Option value="payroll">Payroll</Option>
              <Option value="generic">Generic</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="frequency"
            label="Frequency"
            rules={[{ required: true, message: 'Please select frequency' }]}
          >
            <Select>
              <Option value="daily">Daily</Option>
              <Option value="weekly">Weekly</Option>
              <Option value="monthly">Monthly</Option>
              <Option value="quarterly">Quarterly</Option>
              <Option value="yearly">Yearly</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="nextDate"
            label="Next Date"
            rules={[{ required: true, message: 'Please select next date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="payload" label="Payload (JSON)">
            <Input.TextArea rows={6} placeholder='e.g. {"invoiceLines":[{"product":1,"quantity":1,"amount":100}]}' />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: 'Please select status' }]}
          >
            <Select>
              <Option value="active">Active</Option>
              <Option value="paused">Paused</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTransaction ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default RecurringTransactions;
