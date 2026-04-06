import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, Table, Button, Space, Drawer, Tag, Row, Col, Statistic, message } from 'antd';
import { EyeOutlined, ReloadOutlined, FileTextOutlined, UploadOutlined } from '@ant-design/icons';
import { useCurrency } from '../../../utils/currency';

const Statements = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.listParsedStatements();
      setStatements(Array.isArray(list) ? list : []);
    } catch (_) {
      message.error('Failed to load statements');
      setStatements([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const open = async (st) => {
    setSelected(st);
    try {
      const d = await window.electronAPI.getParsedStatement(st.id);
      setDetails(d || null);
    } catch (_) {
      setDetails(null);
    }
    setDrawerVisible(true);
  };

  const txTotal = (details?.transactions || []).reduce((s, t) => s + Number(t.amount || 0), 0);

  const columns = [
    { title: '#', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Bank', dataIndex: 'bankName', key: 'bankName', render: v => v || '-' },
    { title: 'Period', key: 'period', render: (_, r) => `${r.periodStart || '?'} — ${r.periodEnd || '?'}` },
    { title: 'Currency', dataIndex: 'currency', key: 'currency', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Actions', key: 'actions', width: 100,
      render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => open(r)}>View</Button> },
  ];

  const txColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: v => v || '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: v => { const n = Number(v || 0); return <strong style={{ color: n >= 0 ? '#3f8600' : '#cf1322' }}>{cSym} {n.toFixed(2)}</strong>; } },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => v ? <Tag color={v === 'credit' ? 'green' : v === 'debit' ? 'red' : 'blue'}>{v}</Tag> : '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />Parsed Bank Statements</span>}
        extra={<Space>
          <Button icon={<UploadOutlined />} onClick={() => { history.push('/main/bank-statements/upload'); }}>Upload New</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>}>

        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Statements" value={statements.length} /></Card></Col>
        </Row>

        <Table columns={columns} dataSource={statements} loading={loading} rowKey="id"
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} statements` }} size="middle" />
      </Card>

      <Drawer title={selected ? `Statement #${selected.id} — ${selected.bankName || 'Unknown Bank'}` : 'Statement Details'}
        width={700} visible={drawerVisible} onClose={() => setDrawerVisible(false)} destroyOnClose>
        {details && (
          <>
            <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={8}><Statistic title="Transactions" value={(details.transactions || []).length} /></Col>
              <Col span={8}><Statistic title="Net Total" value={txTotal} prefix={cSym} precision={2} valueStyle={{ color: txTotal >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
              <Col span={8}><Statistic title="Currency" value={selected?.currency || 'ZAR'} /></Col>
            </Row>
            <Table columns={txColumns} dataSource={details.transactions || []} rowKey={(_, i) => i}
              size="small" pagination={{ pageSize: 20, showTotal: t => `${t} rows` }} />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default Statements;


