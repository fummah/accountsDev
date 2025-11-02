import React, { useState } from 'react';
import { Table, Button, Input, DatePicker, Select, Modal, Form } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

export default function IncomeTrackerTab() {
  const [incomeData, setIncomeData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

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

  const handleAddIncome = () => {
    form.validateFields().then(values => {
      setIncomeData([...incomeData, { key: Date.now(), ...values }]);
      form.resetFields();
      setIsModalOpen(false);
    });
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
        <Input placeholder="Search by source or category" className="w-1/3" />
        <RangePicker className="w-1/3" />
        <Select placeholder="Category" className="w-1/3" allowClear>
          <Select.Option value="Sales">Sales</Select.Option>
          <Select.Option value="Services">Services</Select.Option>
          <Select.Option value="Investments">Investments</Select.Option>
        </Select>
      </div>

      <Table columns={columns} dataSource={incomeData} pagination={{ pageSize: 5 }} />

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