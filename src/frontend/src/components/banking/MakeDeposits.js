import React, { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Form, Input, InputNumber, Select, Button, Table, Space, message, Modal } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

// Rebuilt Make Deposits page from scratch
const MakeDeposits = () => {
  const [form] = Form.useForm();
  const [addForm] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadRecent();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      const list = Array.isArray(data) ? data : (data && data.data) ? data.data : [];
      setAccounts(list);
    } catch (e) {
      message.error('Failed to load accounts');
      setAccounts([]);
    }
  };

  const loadRecent = async () => {
    try {
      const txs = await window.electronAPI.getTransactions();
      const deposits = (txs || []).filter(t => (t.type || '').toLowerCase() === 'deposit');
      setRecent(deposits);
    } catch (e) {
      setRecent([]);
    }
  };

  const items = Form.useWatch('items', form) || [];
  const total = useMemo(() => items.reduce((s, it) => s + (Number(it?.amount) || 0), 0), [items]);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const payload = {
        accountId: Number(values.accountId),
        date: values.date.format('YYYY-MM-DD'),
        items: (values.items || []).map(it => ({
          type: it.type,
          reference: it.reference || '',
          description: it.description || '',
          amount: Number(it.amount) || 0,
        })),
        total,
      };
      const res = await window.electronAPI.createDeposit(payload);
      if (res && res.success) {
        message.success('Deposit recorded successfully');
        form.resetFields();
        loadRecent();
      } else {
        throw new Error(res?.error || 'Failed to record deposit');
      }
    } catch (e) {
      message.error(e.message || 'Failed to record deposit');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Account', dataIndex: 'accountId', key: 'accountId' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Reference', dataIndex: 'reference', key: 'reference' },
    { title: 'Amount', dataIndex: 'debit', key: 'debit', render: (v, r) => `$${Number(r.debit || r.amount || 0).toFixed(2)}` },
  ];

  const exportCSV = async () => {
    try {
      const txs = await window.electronAPI.getTransactions();
      const deposits = (txs || []).filter(t => (t.type || '').toLowerCase() === 'deposit');
      const headers = ['id','date','accountId','reference','description','amount'];
      const rows = deposits.map(d => headers.map(h => `"${(d[h] ?? '').toString().replace(/"/g,'""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `deposits_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
      message.error('Failed to export CSV');
    }
  };

  const handleAccountChange = (val) => {
    try {
      form.setFieldsValue({ accountId: val });
      form.validateFields(['accountId']).catch(() => {});
    } catch (e) {}
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Make Deposits</h2>

      <Card style={{ marginBottom: 24 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: moment(), items: [{ type: 'Cash' }] }}>
          <Form.Item name="accountId" label="Deposit To" rules={[{ required: true, message: 'Please select account' }]} validateTrigger="onChange" hasFeedback> 
            <Select 
              placeholder={accounts.length ? 'Select account' : 'No accounts available'}
              showSearch
              optionFilterProp="children"
              onChange={handleAccountChange}
              getPopupContainer={(trigger) => trigger.parentNode}
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  <div style={{ display: 'flex', gap: 8, padding: 8 }}>
                    <Button type="link" icon={<PlusOutlined />} onClick={() => { addForm.setFieldsValue({ type: 'Bank' }); setShowAddAccount(true); }}>Add Account</Button>
                  </div>
                </div>
              )}
            >
              {accounts.map(a => (
                <Option key={a.id} value={String(a.id)}>{a.accountName}{a.accountNumber ? ` (${a.accountNumber})` : ''}</Option>
              ))}
            </Select>
          </Form.Item>

          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Card size="small" title={<span>Deposit Items</span>} extra={<Button onClick={() => add({ type: 'Cash' })} icon={<PlusOutlined />}>Add Item</Button>} style={{ marginBottom: 16 }}>
                {fields.map((field) => (
                  <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...field} name={[field.name, 'type']} fieldKey={[field.fieldKey, 'type']} rules={[{ required: true }]}>
                      <Select style={{ width: 140 }}>
                        <Option value="Cash">Cash</Option>
                        <Option value="Check">Check</Option>
                        <Option value="Card">Card</Option>
                        <Option value="Other">Other</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'reference']} fieldKey={[field.fieldKey, 'reference']}>
                      <Input placeholder="Reference" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'description']} fieldKey={[field.fieldKey, 'description']} style={{ minWidth: 260, flex: 1 }}>
                      <Input placeholder="Description" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'amount']} fieldKey={[field.fieldKey, 'amount']} rules={[{ required: true, message: 'Amount required' }]}> 
                      <InputNumber style={{ width: 160 }} prefix="$" min={0} step={0.01} />
                    </Form.Item>
                    <Button danger onClick={() => remove(field.name)}>Remove</Button>
                  </Space>
                ))}
                <div style={{ textAlign: 'right', fontWeight: 600 }}>Total: ${total.toFixed(2)}</div>
              </Card>
            )}
          </Form.List>

          <Space>
            <Button onClick={() => form.resetFields()}>Reset</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>Save Deposit</Button>
          </Space>
        </Form>
      </Card>

      <Card title="Recent Deposits" extra={<Button onClick={exportCSV}>Export CSV</Button>}>
        <Table columns={columns} dataSource={recent} rowKey="id" pagination={{ pageSize: 8 }} />
      </Card>

      <Modal title="Add Account" open={showAddAccount} onCancel={() => setShowAddAccount(false)} onOk={() => addForm.submit()} okText="Create">
        <Form form={addForm} layout="vertical" onFinish={async (values) => {
          try {
            const name = (values.name || values.accountName || '').toString().trim();
            const type = (values.type || values.accountType || 'Bank').toString().trim();
            const number = values.number ? String(values.number).trim() : null;
            const res = await window.electronAPI.insertChartAccount(name, type, number, 'current_user');
            if (res && res.success) {
              message.success('Account created');
              setShowAddAccount(false);
              addForm.resetFields();
              await loadAccounts();
              if (res.id) {
                form.setFieldsValue({ accountId: String(res.id) });
                form.validateFields(['accountId']).catch(() => {});
              }
            } else {
              throw new Error(res?.error || 'Failed to create account');
            }
          } catch (e) {
            message.error(e.message || 'Failed to create account');
          }
        }}>
          <Form.Item name="number" label="Account Number">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="name" label="Account Name" rules={[{ required: true, message: 'Please enter account name' }]}> 
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Account Type" rules={[{ required: true, message: 'Please select account type' }]} initialValue="Bank">
            <Select placeholder="Select account type">
              <Option value="Asset">Asset</Option>
              <Option value="Liability">Liability</Option>
              <Option value="Equity">Equity</Option>
              <Option value="Income">Income</Option>
              <Option value="Expense">Expense</Option>
              <Option value="Bank">Bank</Option>
              <Option value="Cash">Cash</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MakeDeposits;