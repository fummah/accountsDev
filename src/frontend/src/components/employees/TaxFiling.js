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
      const response = await window.electronAPI.getTaxRecords();
      if (response.success) {
        setTaxRecords(response.data);
      } else {
        throw new Error(response.error || 'Failed to load tax records');
      }
    } catch (error) {
      message.error('Failed to load tax records: ' + error.message);
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

      const response = await window.electronAPI.submitTaxFiling(formData);
      if (response.success) {
        message.success('Tax filing submitted successfully');
        setIsModalVisible(false);
        form.resetFields();
        loadTaxRecords();
      } else {
        throw new Error(response.error || 'Failed to submit tax filing');
      }
    } catch (error) {
      message.error('Failed to submit tax filing');
    } finally {
      setLoading(false);
    }
  };

  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);

  const columns = [
    {
      title: 'Period',
      key: 'period',
      render: (_, record) => `${moment(record.period_start).format('MM/DD/YYYY')} - ${moment(record.period_end).format('MM/DD/YYYY')}`,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Total Amount',
      dataIndex: 'total_amount',
      key: 'total_amount',
      render: (amount) => amount ? `$${Number(amount).toFixed(2)}` : '$0.00',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date) => date ? moment(date).format('MM/DD/YYYY') : 'N/A',
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
    setSelectedRecord(record);
    setViewModalVisible(true);
  };

  const handlePrint = (record) => {
    try {
      const data = record || selectedRecord;
      if (!data) {
        message.error('No tax filing selected to print');
        return;
      }

      const html = `
        <html>
          <head>
            <title>Tax Filing - ${data.type}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; }
              h1 { font-size: 20px; }
              .field { margin-bottom: 8px; }
              .label { font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>Tax Filing</h1>
            <div class="field"><span class="label">Type:</span> ${data.type || ''}</div>
            <div class="field"><span class="label">Period:</span> ${data.period_start ? moment(data.period_start).format('MM/DD/YYYY') : ''} - ${data.period_end ? moment(data.period_end).format('MM/DD/YYYY') : ''}</div>
            <div class="field"><span class="label">Total Amount:</span> ${data.total_amount ? `$${Number(data.total_amount).toFixed(2)}` : '$0.00'}</div>
            <div class="field"><span class="label">Status:</span> ${data.status || ''}</div>
            <div class="field"><span class="label">Due Date:</span> ${data.due_date ? moment(data.due_date).format('MM/DD/YYYY') : 'N/A'}</div>
            <div class="field"><span class="label">Notes:</span> ${data.notes || ''}</div>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        message.error('Unable to open print window (popup blocked?)');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // Give browser a small delay to render before printing
      setTimeout(() => {
        printWindow.print();
        // optionally close
        // printWindow.close();
      }, 300);
    } catch (err) {
      console.error('Print error:', err);
      message.error('Failed to print tax filing');
    }
  };

  const generateReport = () => {
    if (!taxRecords || !taxRecords.length) {
      message.warning('No tax filings to include in report');
      return;
    }

    // Build CSV
    const headers = ['id','type','period_start','period_end','total_amount','status','due_date','submitted_date','notes'];
    const rows = taxRecords.map(r => headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_filings_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Compute summary and show modal
    const summary = taxRecords.reduce((acc, r) => {
      acc.total += Number(r.total_amount || 0);
      acc.count += 1;
      acc.byType[r.type] = (acc.byType[r.type] || 0) + Number(r.total_amount || 0);
      return acc;
    }, { total: 0, count: 0, byType: {} });
    setReportSummary(summary);
    setReportModalVisible(true);
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
                  {record.type} - Due: {record.due_date ? moment(record.due_date).format('MM/DD/YYYY') : 'N/A'}
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
            <Button onClick={generateReport}>Generate Reports</Button>
        </Card>
      </div>

      <Table 
        columns={columns} 
        dataSource={taxRecords}
        rowKey="id"
      />

      {/* View / Print Modal */}
      <Modal
        title="Tax Filing Details"
        open={viewModalVisible}
        onCancel={() => { setViewModalVisible(false); setSelectedRecord(null); }}
        footer={[
          <Button key="print" type="primary" onClick={() => handlePrint(selectedRecord)}>Print</Button>,
          <Button key="close" onClick={() => { setViewModalVisible(false); setSelectedRecord(null); }}>Close</Button>
        ]}
        width={700}
      >
        {selectedRecord ? (
          <div>
            <p><strong>Type:</strong> {selectedRecord.type}</p>
            <p><strong>Period:</strong> {selectedRecord.period_start ? moment(selectedRecord.period_start).format('MM/DD/YYYY') : 'N/A'} - {selectedRecord.period_end ? moment(selectedRecord.period_end).format('MM/DD/YYYY') : 'N/A'}</p>
            <p><strong>Total Amount:</strong> {selectedRecord.total_amount ? `$${Number(selectedRecord.total_amount).toFixed(2)}` : '$0.00'}</p>
            <p><strong>Status:</strong> {selectedRecord.status}</p>
            <p><strong>Due Date:</strong> {selectedRecord.due_date ? moment(selectedRecord.due_date).format('MM/DD/YYYY') : 'N/A'}</p>
            <p><strong>Notes:</strong> {selectedRecord.notes}</p>
          </div>
        ) : null}
      </Modal>

      {/* Report Summary Modal */}
      <Modal
        title="Tax Report Summary"
        open={reportModalVisible}
        onCancel={() => setReportModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setReportModalVisible(false)}>Close</Button>
        ]}
        width={600}
      >
        {reportSummary ? (
          <div>
            <p><strong>Total Filings:</strong> {reportSummary.count}</p>
            <p><strong>Total Amount:</strong> ${reportSummary.total.toFixed(2)}</p>
            <h4>By Type</h4>
            <ul>
              {Object.keys(reportSummary.byType).map(t => (
                <li key={t}>{t}: ${reportSummary.byType[t].toFixed(2)}</li>
              ))}
            </ul>
          </div>
        ) : <p>No report data</p>}
      </Modal>

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