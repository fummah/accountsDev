import React, { useState } from 'react';
import { Card, Table, DatePicker, Select, Button, Row, Col, Form } from 'antd';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const JobCosting = () => {
  const [dateRange, setDateRange] = useState([moment().startOf('month'), moment()]);
  const [selectedJob, setSelectedJob] = useState(null);

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

  // Sample data - replace with actual data from your backend
  const data = [
    {
      key: '1',
      date: '2025-11-01',
      jobName: 'Project A',
      type: 'Labor',
      description: 'Construction work',
      laborCost: 1500.00,
      materialCost: 0.00,
      totalCost: 1500.00
    },
    {
      key: '2',
      date: '2025-11-01',
      jobName: 'Project A',
      type: 'Material',
      description: 'Building materials',
      laborCost: 0.00,
      materialCost: 2500.00,
      totalCost: 2500.00
    }
  ];

  const handleDateChange = (dates) => {
    setDateRange(dates);
  };

  const handleJobChange = (value) => {
    setSelectedJob(value);
  };

  const handleRefresh = () => {
    // Add logic to refresh data based on selected filters
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
        pagination={false}
        summary={pageData => {
          let totalLaborCost = 0;
          let totalMaterialCost = 0;
          let totalCost = 0;

          pageData.forEach(({ laborCost, materialCost, totalCost: cost }) => {
            totalLaborCost += laborCost;
            totalMaterialCost += materialCost;
            totalCost += cost;
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
    </Card>
  );
};

export default JobCosting;