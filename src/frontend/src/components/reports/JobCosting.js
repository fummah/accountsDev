import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const JobCosting = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedJob, setSelectedJob] = useState('all');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobOptions, setJobOptions] = useState([]);

  useEffect(() => {
    // initial load
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: text => moment(text).format('MM/DD/YYYY')
    },
    {
      title: 'Job/Project',
      dataIndex: 'jobName',
      key: 'jobName',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Labor Cost',
      dataIndex: 'laborCost',
      key: 'laborCost',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    },
    {
      title: 'Material Cost',
      dataIndex: 'materialCost',
      key: 'materialCost',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    },
    {
      title: 'Total Cost',
      dataIndex: 'totalCost',
      key: 'totalCost',
      align: 'right',
      render: value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    }
  ];

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await window.electronAPI.getManagementReport(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );
      // Base rows: use live expenses during the period and treat each payee as a job/project
      const expenses = await window.electronAPI.getAllExpenses();
      const expList = Array.isArray(expenses) ? expenses : (expenses && expenses.all) ? expenses.all : expenses?.data || [];
      const expRows = expList
        .filter(e => {
          const d = e.payment_date ? moment(e.payment_date) : null;
          return d && d.isBetween(dateRange[0].startOf('day'), dateRange[1].endOf('day'), null, '[]');
        })
        .map((e, idx) => ({
          key: `e-${idx}`,
          date: e.payment_date,
          jobName: e.payee_name || String(e.payee || ''),
          type: 'Expense',
          description: e.category || e.ref_no || e.description || '',
          laborCost: 0,
          materialCost: Number(e.amount || 0),
          totalCost: Number(e.amount || 0),
        }));

      // Optional: add management KPIs as summary pseudo-rows (not dummy - from backend)
      const rows = [...expRows];
      setData(rows);

      // Build job options from payee names present in expenses
      const jobs = Array.from(new Set(expRows.map(r => r.jobName).filter(Boolean)));
      setJobOptions(jobs);
    } catch (err) {
      console.error('Failed to load job costing', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (dates) => {
    setDateRange(dates);
  };

  const handleJobChange = (value) => {
    setSelectedJob(value);
  };

  const handleRefresh = () => {
    fetchReport();
  };

  const handlePrint = () => {
    try {
      const rows = filteredData.map(r => `<tr>
        <td>${r.date ? moment(r.date).format('YYYY-MM-DD') : ''}</td>
        <td>${r.jobName || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.description || ''}</td>
        <td style="text-align:right">${Number(r.laborCost || 0).toFixed(2)}</td>
        <td style="text-align:right">${Number(r.materialCost || 0).toFixed(2)}</td>
        <td style="text-align:right">${Number(r.totalCost || 0).toFixed(2)}</td>
      </tr>`).join('');
      const html = `<!doctype html><html><head><title>Job Costing Report</title>
      <style>body{font-family:Arial;padding:16px}h2{margin:0 0 8px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}
      th{text-align:left}</style></head><body>
      <h2>Job Costing Report</h2>
      <p>Period: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')} | Job: ${selectedJob}</p>
      <table><thead><tr>
        <th>Date</th><th>Job/Project</th><th>Type</th><th>Description</th><th>Labor Cost</th><th>Material Cost</th><th>Total Cost</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
      const w = window.open('', '_blank');
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    } catch (e) { /* ignore */ }
  };

  const filteredData = useMemo(() => {
    if (!selectedJob || selectedJob === 'all') return data;
    return data.filter(r => (r.jobName || '').toString() === selectedJob);
  }, [data, selectedJob]);

  return (
    <Card title="Job Costing Report">
      <Form layout="vertical">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Date Range">
              <RangePicker
                value={dateRange}
                onChange={handleDateChange}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Job/Project">
              <Select
                placeholder="Select a job"
                onChange={handleJobChange}
                value={selectedJob}
                style={{ width: '100%' }}
              >
                <Option value="all">All Jobs</Option>
                {jobOptions.map(j => (
                  <Option key={j} value={j}>{j}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" ">
              <Button type="primary" onClick={handleRefresh}>
                Refresh Report
              </Button>
              <Button icon={<PrinterOutlined />} style={{ marginLeft: 8 }} onClick={handlePrint}>
                Print
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Table
        columns={columns}
        dataSource={filteredData}
        loading={loading}
        pagination={false}
        summary={pageData => {
          let totalLaborCost = 0;
          let totalMaterialCost = 0;
          let totalCost = 0;

          pageData.forEach(({ laborCost, materialCost, totalCost: cost }) => {
            totalLaborCost += Number(laborCost || 0);
            totalMaterialCost += Number(materialCost || 0);
            totalCost += Number(cost || 0);
          });

          return (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell colSpan={4}>Total</Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {totalLaborCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {totalMaterialCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {totalCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          );
        }}
      />
      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </Card>
  );
};

export default JobCosting;