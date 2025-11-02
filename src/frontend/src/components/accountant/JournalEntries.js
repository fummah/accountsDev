import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, DatePicker, Select, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const JournalEntries = () => {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [journalData, accountsData] = await Promise.all([
        window.electronAPI.getJournal(),
        window.electronAPI.getChartOfAccounts()
      ]);
      setEntries(journalData);
      setAccounts(accountsData);
    } catch (error) {
      message.error('Failed to load data');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const journalEntry = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
        entryLines: values.entries.map(entry => ({
          ...entry,
          amount: parseFloat(entry.amount)
        }))
      };

      await window.electronAPI.insertJournal(journalEntry);
      message.success('Journal entry created successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error('Failed to create journal entry');
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => moment(date).format('DD/MM/YYYY'),
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
    {
      title: 'Debit Total',
      dataIndex: 'debitTotal',
      key: 'debitTotal',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Credit Total',
      dataIndex: 'creditTotal',
      key: 'creditTotal',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Journal Entries</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setIsModalVisible(true)}
        >
          Add Journal Entry
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={entries}
        rowKey="id"
      />

      <Modal
        title="New Journal Entry"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="reference"
            label="Reference"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.List name="entries">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'accountId']}
                      rules={[{ required: true }]}
                      style={{ flex: 2 }}
                    >
                      <Select placeholder="Select account">
                        {accounts.map(account => (
                          <Option key={account.id} value={account.id}>
                            {account.accountName}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'type']}
                      rules={[{ required: true }]}
                      style={{ flex: 1 }}
                    >
                      <Select placeholder="Type">
                        <Option value="debit">Debit</Option>
                        <Option value="credit">Credit</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'amount']}
                      rules={[{ required: true }]}
                      style={{ flex: 1 }}
                    >
                      <Input type="number" prefix="$" placeholder="Amount" />
                    </Form.Item>

                    <Button type="link" danger onClick={() => remove(name)}>
                      Delete
                    </Button>
                  </div>
                ))}

                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block>
                    Add Line
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default JournalEntries;