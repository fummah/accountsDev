import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form } from 'antd';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const JobCosting = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      // Map management report tableData into job costing rows where reasonable
      if (report && Array.isArray(report.tableData)) {
        const rows = report.tableData.map((r, i) => {
          // attempt to parse numeric value from formatted string
          const raw = typeof r.value === 'string' ? Number(String(r.value).replace(/[^0-9.-]+/g, '')) : Number(r.value || 0);
          return {
            key: String(i + 1),
            date: dateRange[0].format('YYYY-MM-DD'),
            jobName: r.metric,
            type: 'Summary',
            description: r.metric,
            laborCost: raw,
            materialCost: 0,
            totalCost: raw,
          };
        });
        setData(rows);
      } else {
        setData([]);
      }
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
                <Option value="projectA">Project A</Option>
                <Option value="projectB">Project B</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" ">
              <Button type="primary" onClick={handleRefresh}>
                Refresh Report
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Table
        columns={columns}
        dataSource={data}
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