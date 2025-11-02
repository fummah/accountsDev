import React, { useState, useEffect } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, DatePicker, Select, InputNumber, message } from 'antd';
import { SyncOutlined, FileTextOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;
const { Option } = Select;


const ReconcileAndJournal = () => {
  const [journalVisible, setJournalVisible] = useState(false);
  const [form] = Form.useForm();
  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load journal entries from backend
  const loadJournal = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.getJournal();
      if (Array.isArray(data)) {
        setJournalEntries(data.map((entry, idx) => ({
          key: entry.id || idx,
          date: entry.date,
          description: entry.description,
          lines: entry.lines || [],
        })));
      } else {
        setJournalEntries([]);
      }
    } catch (e) {
      setError('Failed to load journal entries');
      setJournalEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadJournal();
  }, []);

  const handleJournalSubmit = async (values) => {
    try {
      const res = await window.electronAPI.insertJournal({
        date: values.date.format('YYYY-MM-DD'),
        description: values.description,
        lines: values.entries,
        entered_by: 'system',
      });
      await loadJournal();
      message.success('Journal entry saved');
    } catch (e) {
      setError('Failed to add journal entry');
      message.error('Failed to add journal entry');
    }
    form.resetFields();
    setJournalVisible(false);
  };


  return (
    <div style={{ padding: 24 }}>
      {error && <div style={{ color: 'red', margin: 8 }}>{error}</div>}
      <Tabs defaultActiveKey="2">
        <TabPane
          tab={
            <span>
              <SyncOutlined /> Reconcile Accounts
            </span>
          }
          key="1"
        >
          {/* Placeholder for reconciliation table, not yet implemented */}
          <div>Reconciliation data coming soon.</div>
        </TabPane>
        <TabPane
          tab={
            <span>
              <FileTextOutlined /> Journal Entries
            </span>
          }
          key="2"
        >
          <Button type="primary" onClick={() => setJournalVisible(true)} style={{ marginBottom: 16 }}>
            New Journal Entry
          </Button>
          <Table
            columns={[
              { title: 'Date', dataIndex: 'date' },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Lines', dataIndex: 'lines', render: (lines) => (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {lines && lines.map((l, i) => (
                    <li key={i}>{l.account}: Debit {l.debit || 0}, Credit {l.credit || 0}</li>
                  ))}
                </ul>
              ) },
            ]}
            dataSource={journalEntries}
            loading={loading}
            pagination={{ pageSize: 5 }}
          />
          <Modal
            title="New Journal Entry"
            open={journalVisible}
            onCancel={() => setJournalVisible(false)}
            onOk={() => form.submit()}
          >
            <Form form={form} layout="vertical" onFinish={handleJournalSubmit}>
              <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                <Input placeholder="e.g., Rent payment adjustment" />
              </Form.Item>
              <Form.List name="entries" initialValue={[{}]}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name }) => (
                      <div key={key} style={{ display: 'flex', marginBottom: 8, gap: 8 }}>
                        <Form.Item
                          name={[name, 'account']}
                          rules={[{ required: true, message: 'Select account' }]}
                          style={{ flex: 2 }}
                        >
                          <Input placeholder="Account" />
                        </Form.Item>
                        <Form.Item
                          name={[name, 'debit']}
                          rules={[{ required: false }]}
                          style={{ flex: 1 }}
                        >
                          <InputNumber placeholder="Debit" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name={[name, 'credit']}
                          rules={[{ required: false }]}
                          style={{ flex: 1 }}
                        >
                          <InputNumber placeholder="Credit" style={{ width: '100%' }} />
                        </Form.Item>
                        <Button danger onClick={() => remove(name)} type="text">
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Form.Item>
                      <Button onClick={() => add()} block>
                        Add Line
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </Form>
          </Modal>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default ReconcileAndJournal;
