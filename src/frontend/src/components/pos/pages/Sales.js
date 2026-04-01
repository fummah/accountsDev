import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Row, Col, Statistic, Space, message } from 'antd';
import { ReloadOutlined, ArrowLeftOutlined, DollarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const history = useHistory();

  const load = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.posListSales();
      setSales(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error(String(e?.message || e));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalRevenue = sales.reduce((s, sl) => s + Number(sl.total || 0), 0);
  const cashSales = sales.filter(s => s.paymentType === 'cash');
  const cardSales = sales.filter(s => s.paymentType === 'card');

  const columns = [
    { title: '#', dataIndex: 'id', key: 'id', width: 70, sorter: (a, b) => a.id - b.id },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 160,
      render: v => v ? new Date(v).toLocaleString() : '-',
      sorter: (a, b) => (a.date || '').localeCompare(b.date || '') },
    { title: 'Session', dataIndex: 'sessionId', key: 'sessionId', width: 90 },
    { title: 'Customer', dataIndex: 'customerId', key: 'customerId', width: 100,
      render: v => v || <span style={{ color: '#8c8c8c' }}>Walk-in</span> },
    { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', width: 110, align: 'right',
      render: v => `R ${Number(v || 0).toFixed(2)}` },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 110, align: 'right',
      render: v => <strong style={{ color: '#1890ff' }}>R {Number(v || 0).toFixed(2)}</strong>,
      sorter: (a, b) => Number(a.total || 0) - Number(b.total || 0) },
    { title: 'Payment', dataIndex: 'paymentType', key: 'paymentType', width: 100, align: 'center',
      filters: [
        { text: 'Cash', value: 'cash' },
        { text: 'Card', value: 'card' },
        { text: 'Mobile', value: 'mobile' },
      ],
      onFilter: (val, record) => record.paymentType === val,
      render: v => {
        const colors = { cash: 'green', card: 'blue', mobile: 'orange' };
        return <Tag color={colors[v] || 'default'}>{(v || 'N/A').toUpperCase()}</Tag>;
      }
    },
  ];

  return (
    <div className="gx-p-4">
      <Card title={<span><DollarOutlined /> Sales History</span>}
        extra={<Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/main/pos/session')}>Session</Button>
          <Button icon={<ShoppingCartOutlined />} type="primary" onClick={() => history.push('/main/pos/sale')}>New Sale</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>}>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="Total Sales" value={sales.length} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="Revenue" value={totalRevenue.toFixed(2)} prefix="R" valueStyle={{ color: '#1890ff' }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="Cash Sales" value={cashSales.length} valueStyle={{ color: '#52c41a' }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="Card Sales" value={cardSales.length} valueStyle={{ color: '#1890ff' }} /></Card>
          </Col>
        </Row>

        <Table
          dataSource={sales}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} sales` }}
        />
      </Card>
    </div>
  );
};

export default Sales;


