import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, DatePicker, Select, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const JournalEntries = () => {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [entities, setEntities] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [journalData, accountsData, entitiesData, cls, locs, deps] = await Promise.all([
        window.electronAPI.getJournal(),
        window.electronAPI.getChartOfAccounts(),
        window.electronAPI.listEntities ? window.electronAPI.listEntities() : [],
        window.electronAPI.listClasses ? window.electronAPI.listClasses() : [],
        window.electronAPI.listLocations ? window.electronAPI.listLocations() : [],
        window.electronAPI.listDepartments ? window.electronAPI.listDepartments() : []
      ]);
      const rows = Array.isArray(journalData) ? journalData.map(e => {
        const lines = Array.isArray(e.lines) ? e.lines : [];
        const debitTotal = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const creditTotal = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
        return { ...e, debitTotal, creditTotal };
      }) : [];
      setEntries(rows);
      setAccounts(accountsData);
      setEntities(Array.isArray(entitiesData) ? entitiesData : []);
      setClasses(Array.isArray(cls) ? cls : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setDepartments(Array.isArray(deps) ? deps : []);
    } catch (error) {
      message.error('Failed to load data');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const lines = (values.entries || []).map(entry => {
        const accountObj = Array.isArray(accounts) ? accounts.find(a => a.id === entry.accountId) : null;
        const accountLabel = accountObj
          ? (accountObj.accountName || accountObj.name || accountObj.account_number || accountObj.number || String(accountObj.id))
          : String(entry.accountId);
        const amount = Number(entry.amount) || 0;
        return {
          account: accountLabel,
          debit: entry.type === 'debit' ? amount : 0,
          credit: entry.type === 'credit' ? amount : 0,
        };
      });

      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        description: values.description,
        entered_by: 'ui',
        lines,
        entity_id: values.entity_id || null
        , class: values.class || null
        , location: values.location || null
        , department: values.department || null
      };

      const res = await window.electronAPI.insertJournal(payload);
      if (res && res.error) {
        throw new Error(res.error);
      }
      message.success('Journal entry created successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error(error?.message || 'Failed to create journal entry');
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
      render: (amount) => {
        const n = Number(amount);
        return Number.isFinite(n) ? `$${n.toFixed(2)}` : '';
      },
    },
    {
      title: 'Credit Total',
      dataIndex: 'creditTotal',
      key: 'creditTotal',
      render: (amount) => {
        const n = Number(amount);
        return Number.isFinite(n) ? `$${n.toFixed(2)}` : '';
      },
    },
    {
      title: 'Anchor',
      key: 'anchor',
      render: (_, r) => (
        <Button size="small" onClick={async () => {
          try {
            const res = await window.electronAPI.journalAnchor?.(r.id);
            if (res?.success) message.success('Anchor queued'); else message.error(res?.error || 'Failed');
          } catch (e) { message.error(e?.message || 'Error'); }
        }}>Anchor</Button>
      )
    }
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
            name="entity_id"
            label="Entity"
          >
            <Select placeholder="Select entity (optional)">
              {entities.map(e => (
                <Option key={e.id} value={e.id}>{e.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="class" label="Class">
            <Select allowClear placeholder="Select class">
              {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="location" label="Location">
            <Select allowClear placeholder="Select location">
              {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="department" label="Department">
            <Select allowClear placeholder="Select department">
              {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
            </Select>
          </Form.Item>
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