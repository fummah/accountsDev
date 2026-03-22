import React, { useState, useEffect } from 'react';
import { Table, Button, Input, DatePicker, Select, Modal, Form, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

export default function IncomeTrackerTab() {
  const [incomeData, setIncomeData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    dateRange: null,
    category: null,
    searchText: ''
  });
  const [form] = Form.useForm();

  useEffect(() => {
    fetchIncomeData();
  }, [searchParams]);

  const fetchIncomeData = async () => {
    try {
      setLoading(true);
      const response = await window.electronAPI.getIncomeTransactions(searchParams);
      
      if (response.success) {
        setIncomeData(response.data.map(item => ({
          ...item,
          key: item.id,
          date: item.date // Assuming date is in YYYY-MM-DD format
        })));
      } else {
        message.error(response.error || 'Failed to fetch income data');
      }
    } catch (error) {
      console.error('Error fetching income data:', error);
      message.error('Failed to load income data');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date'
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source'
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category'
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (value) => `$${parseFloat(value).toFixed(2)}`
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes'
    }
  ];

  const handleAddIncome = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // Map our form fields to the recurring transaction schema expected by the backend
      const recurringPayload = {
        description: values.source || values.notes || 'Income',
        amount: values.amount,
        frequency: 'one-time',
        nextDate: values.date ? values.date.format('YYYY-MM-DD') : null,
        status: 'active'
      };

      const response = await window.electronAPI.createRecurringTransaction(recurringPayload);
      
      if (response.success) {
        message.success('Income transaction added successfully');
        form.resetFields();
        setIsModalOpen(false);
        fetchIncomeData(); // Refresh the list
      } else {
        throw new Error(response.error || 'Failed to add income transaction');
      }
    } catch (error) {
      message.error(error.message || 'Failed to add income transaction');
      console.error('Add income error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Income Tracker</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          Add Income
        </Button>
      </div>

      <div className="flex gap-4 mb-4">
        <Input 
          placeholder="Search by source or category" 
          className="w-1/3" 
          onChange={e => setSearchParams(prev => ({ ...prev, searchText: e.target.value }))}
        />
        <RangePicker 
          className="w-1/3" 
          onChange={dates => setSearchParams(prev => ({ 
            ...prev, 
            dateRange: dates ? dates.map(d => d.format('YYYY-MM-DD')) : null 
          }))}
        />
        <Select 
          placeholder="Category" 
          className="w-1/3" 
          allowClear
          onChange={category => setSearchParams(prev => ({ ...prev, category }))}
        >
          <Select.Option value="Sales">Sales</Select.Option>
          <Select.Option value="Services">Services</Select.Option>
          <Select.Option value="Investments">Investments</Select.Option>
          <Select.Option value="Other">Other</Select.Option>
        </Select>
      </div>

      <Table 
        columns={columns} 
        dataSource={incomeData} 
        pagination={{ pageSize: 10 }}
        loading={loading}
        locale={{
          emptyText: loading ? 'Loading...' : 'No income transactions found'
        }}
      />

      <Modal
        title="Add Income"
        visible={isModalOpen}
        onOk={handleAddIncome}
        onCancel={() => setIsModalOpen(false)}
        okText="Add"
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Date" name="date" rules={[{ required: true }]}> 
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Source" name="source" rules={[{ required: true }]}> 
            <Input />
          </Form.Item>
          <Form.Item label="Category" name="category" rules={[{ required: true }]}> 
            <Select>
              <Select.Option value="Sales">Sales</Select.Option>
              <Select.Option value="Services">Services</Select.Option>
              <Select.Option value="Investments">Investments</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="Amount" name="amount" rules={[{ required: true }]}> 
            <Input type="number" prefix="$" />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}