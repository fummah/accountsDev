import React, { useState, useEffect } from 'react';
import { Card, Table, Button, DatePicker, Select, Form, Modal, Upload, message, Input } from 'antd';
import { UploadOutlined, FileTextOutlined, PrinterOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;

const TaxFiling = () => {
  const [taxRecords, setTaxRecords] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadTaxRecords();
  }, []);

  const loadTaxRecords = async () => {
    try {
      // TODO: Implement getTaxRecords in the backend
      const data = [];
      setTaxRecords(data);
    } catch (error) {
      message.error('Failed to load tax records');
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const formData = {
        ...values,
        period: {
          start: values.period[0].format('YYYY-MM-DD'),
          end: values.period[1].format('YYYY-MM-DD')
        }
      };

      // TODO: Implement submitTaxFiling in the backend
      await window.electronAPI.submitTaxFiling(formData);
      message.success('Tax filing submitted successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadTaxRecords();
    } catch (error) {
      message.error('Failed to submit tax filing');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Period',
      key: 'period',
      render: (_, record) => `${moment(record.periodStart).format('MM/DD/YYYY')} - ${moment(record.periodEnd).format('MM/DD/YYYY')}`,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button.Group>
          <Button 
            icon={<FileTextOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            View
          </Button>
          <Button 
            icon={<PrinterOutlined />}
            onClick={() => handlePrint(record)}
          >
            Print
          </Button>
        </Button.Group>
      ),
    },
  ];

  const handleViewDetails = (record) => {
    // Implement view details functionality
  };

  const handlePrint = (record) => {
    // Implement print functionality
  };

  return (
    <div style={{ padding: '24px' }}>
      <h2>Tax Filing</h2>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <Card title="Upcoming Filings" style={{ flex: 1 }}>
          <ul>
            {taxRecords
              .filter(record => record.status === 'pending')
              .slice(0, 3)
              .map(record => (
                <li key={record.id}>
                  {record.type} - Due: {moment(record.dueDate).format('MM/DD/YYYY')}
                </li>
              ))}
          </ul>
        </Card>

        <Card title="Quick Actions" style={{ flex: 1 }}>
          <Button 
            type="primary" 
            onClick={() => setIsModalVisible(true)}
            style={{ marginRight: '8px' }}
          >
            New Filing
          </Button>
          <Button>Generate Reports</Button>
        </Card>
      </div>

      <Table 
        columns={columns} 
        dataSource={taxRecords}
        rowKey="id"
      />

      <Modal
        title="New Tax Filing"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={800}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="type"
            label="Filing Type"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="payroll">Payroll Tax</Option>
              <Option value="income">Income Tax</Option>
              <Option value="social_security">Social Security</Option>
              <Option value="medicare">Medicare</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="period"
            label="Filing Period"
            rules={[{ required: true }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="documents"
            label="Supporting Documents"
          >
            <Upload>
              <Button icon={<UploadOutlined />}>Upload Files</Button>
            </Upload>
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaxFiling;