import React, { useEffect, useState } from 'react';
import { Card, DatePicker, Table, Row, Col, Statistic } from 'antd';
import moment from 'moment';

const ARAging = () => {
  const [date, setDate] = useState(moment());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ summary: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }, byCustomer: [] });

  const loadData = async (d) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getARAging(d.format('YYYY-MM-DD'));
      if (res && res.success) setData(res);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const columns = [
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName' },
    { title: 'Current', dataIndex: 'current', key: 'current', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
    { title: '1-30', dataIndex: '1-30', key: '1-30', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
    { title: '31-60', dataIndex: '31-60', key: '31-60', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
    { title: '61-90', dataIndex: '61-90', key: '61-90', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
    { title: '90+', dataIndex: '90+', key: '90+', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: v => `$${(v || 0).toFixed(2)}` },
  ];

  const rows = (data.byCustomer || []).map(g => {
    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    (g.invoices || []).forEach(inv => { buckets[inv.bucket] += inv.balance; });
    return {
      key: g.customerId || g.customerName,
      customerName: g.customerName,
      ...buckets,
      total: g.total || 0
    };
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>A/R Aging</h2>
        <DatePicker value={date} onChange={setDate} />
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card><Statistic title="Current" value={data.summary.current || 0} precision={2} prefix="$" /></Card></Col>
        <Col span={4}><Card><Statistic title="1-30" value={data.summary['1-30'] || 0} precision={2} prefix="$" /></Card></Col>
        <Col span={4}><Card><Statistic title="31-60" value={data.summary['31-60'] || 0} precision={2} prefix="$" /></Card></Col>
        <Col span={4}><Card><Statistic title="61-90" value={data.summary['61-90'] || 0} precision={2} prefix="$" /></Card></Col>
        <Col span={4}><Card><Statistic title="90+" value={data.summary['90+'] || 0} precision={2} prefix="$" /></Card></Col>
        <Col span={4}><Card><Statistic title="Total" value={data.summary.total || 0} precision={2} prefix="$" /></Card></Col>
      </Row>
      <Card>
        <Table columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
};

export default ARAging;


