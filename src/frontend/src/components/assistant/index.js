import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Tag, Avatar, Tooltip, Table, Row, Col, Statistic, Space, message, Empty } from 'antd';
import { SendOutlined, DeleteOutlined, RobotOutlined, UserOutlined, CopyOutlined, BulbOutlined,
  DollarOutlined, TeamOutlined, FileTextOutlined, BankOutlined, BarChartOutlined, ShoppingOutlined,
  ClockCircleOutlined, PieChartOutlined, FundOutlined, ThunderboltOutlined } from '@ant-design/icons';

const KPI_COLORS = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];

const SUGGESTIONS = [
  { label: 'Overdue Invoices', icon: <FileTextOutlined />, q: 'overdue invoices' },
  { label: 'Revenue This Month', icon: <DollarOutlined />, q: 'total revenue this month' },
  { label: 'Profit Margin', icon: <PieChartOutlined />, q: 'profit margin' },
  { label: 'Cash Balance', icon: <BankOutlined />, q: 'cash balance' },
  { label: 'Top Customers', icon: <TeamOutlined />, q: 'top customers' },
  { label: 'Expenses This Month', icon: <FundOutlined />, q: 'total expenses this month' },
  { label: 'Employee Count', icon: <TeamOutlined />, q: 'how many employees' },
  { label: 'Stock Levels', icon: <ShoppingOutlined />, q: 'stock levels' },
  { label: 'Outstanding Bills', icon: <FileTextOutlined />, q: 'outstanding bills' },
  { label: 'Best Month', icon: <BarChartOutlined />, q: 'best performing month' },
  { label: 'Recent Transactions', icon: <ClockCircleOutlined />, q: 'recent transactions' },
  { label: 'Cashflow Forecast', icon: <ThunderboltOutlined />, q: 'cashflow forecast' },
];

const Assistant = () => {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [items]);

  const ask = async (question) => {
    const text = question || q;
    if (!text.trim()) return;
    setQ('');
    const userMsg = { role: 'user', text, ts: Date.now() };
    setItems(prev => [...prev, userMsg]);
    try {
      setBusy(true);
      const resp = await window.electronAPI.assistantAsk?.(text);
      setItems(prev => [...prev, { role: 'assistant', data: resp, ts: Date.now() }]);
    } catch (e) {
      setItems(prev => [...prev, { role: 'assistant', data: { answerType: 'text', data: `Error: ${e?.message || 'Something went wrong'}` }, ts: Date.now() }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const copyText = (text) => {
    navigator.clipboard?.writeText(text).then(() => message.success('Copied')).catch(() => {});
  };

  const renderKpi = (data) => {
    if (!data || typeof data !== 'object') return null;
    const entries = Object.entries(data);
    return (
      <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
        {entries.map(([k, v], i) => (
          <Col key={k} xs={12} sm={entries.length <= 3 ? 8 : 6}>
            <Card size="small" style={{ borderTop: `3px solid ${KPI_COLORS[i % KPI_COLORS.length]}`, textAlign: 'center' }} bodyStyle={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'capitalize', marginBottom: 2 }}>{k.replace(/([A-Z])/g, ' $1')}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: KPI_COLORS[i % KPI_COLORS.length] }}>{String(v)}</div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  };

  const renderList = (data) => {
    if (!Array.isArray(data) || data.length === 0) return null;
    if (typeof data[0] !== 'object') {
      return <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{data.slice(0, 20).map((r, i) => <li key={i}>{String(r)}</li>)}</ul>;
    }
    const keys = Object.keys(data[0]).filter(k => k !== 'id').slice(0, 6);
    const cols = keys.map(k => ({
      title: k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      dataIndex: k,
      key: k,
      ellipsis: true,
      render: v => String(v ?? '-'),
    }));
    return (
      <div style={{ marginTop: 8, maxHeight: 280, overflow: 'auto' }}>
        <Table columns={cols} dataSource={data.slice(0, 20)} size="small" pagination={false} rowKey={(r, i) => r.id || i} bordered />
      </div>
    );
  };

  const renderMessage = (it, idx) => {
    if (it.role === 'user') {
      return (
        <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{ maxWidth: '80%', display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <Avatar size={32} style={{ background: '#1890ff', flexShrink: 0 }} icon={<UserOutlined />} />
            <div style={{ padding: '10px 14px', background: '#1890ff', color: '#fff', borderRadius: '12px 12px 0 12px', fontSize: 13 }}>
              {it.text}
            </div>
          </div>
        </div>
      );
    }

    const d = it.data || {};
    const summaryText = d.summary || '';
    const copyable = d.answerType === 'text' ? String(d.data || '') : summaryText;

    return (
      <div key={idx} style={{ display: 'flex', marginBottom: 12 }}>
        <div style={{ maxWidth: '85%', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Avatar size={32} style={{ background: '#722ed1', flexShrink: 0 }} icon={<RobotOutlined />} />
          <div style={{ padding: '10px 14px', background: '#f6f6f6', borderRadius: '12px 12px 12px 0', fontSize: 13, position: 'relative' }}>
            {summaryText && <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>{summaryText}</div>}
            {d.answerType === 'kpi' && renderKpi(d.data)}
            {d.answerType === 'list' && renderList(d.data)}
            {d.answerType === 'text' && <div style={{ whiteSpace: 'pre-wrap', color: '#444', lineHeight: 1.6 }}>{String(d.data || '')}</div>}
            {copyable && (
              <Tooltip title="Copy">
                <CopyOutlined style={{ position: 'absolute', top: 8, right: 8, color: '#bfbfbf', cursor: 'pointer', fontSize: 12 }} onClick={() => copyText(copyable)} />
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  };

  const welcomeScreen = (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <Avatar size={64} style={{ background: '#722ed1', marginBottom: 16 }} icon={<RobotOutlined style={{ fontSize: 32 }} />} />
      <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>AI Business Assistant</h3>
      <p style={{ color: '#8c8c8c', marginBottom: 24 }}>Ask me about your finances, invoices, expenses, customers, and more.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {SUGGESTIONS.map(s => (
          <Button key={s.q} size="small" icon={s.icon} onClick={() => ask(s.q)}
            style={{ borderRadius: 16, fontSize: 12 }}>{s.label}</Button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ fontSize: 20, color: '#722ed1' }} />
            <span style={{ fontWeight: 700 }}>AI Assistant</span>
          </div>
        }
        extra={
          <Space>
            <Tag color="purple">{SUGGESTIONS.length} quick actions</Tag>
            {items.length > 0 && (
              <Tooltip title="Clear Chat">
                <Button size="small" icon={<DeleteOutlined />} onClick={() => setItems([])} type="text" danger />
              </Tooltip>
            )}
          </Space>
        }
        bodyStyle={{ padding: 0 }}
      >
        {/* Chat Area */}
        <div style={{ height: 480, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {items.length === 0 ? welcomeScreen : items.map((it, idx) => renderMessage(it, idx))}
          {busy && (
            <div style={{ display: 'flex', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Avatar size={32} style={{ background: '#722ed1' }} icon={<RobotOutlined />} />
                <div style={{ padding: '10px 14px', background: '#f6f6f6', borderRadius: '12px 12px 12px 0', color: '#8c8c8c' }}>
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick Suggestions (when chat has items) */}
        {items.length > 0 && (
          <div style={{ padding: '4px 16px 8px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <BulbOutlined style={{ color: '#fa8c16', marginTop: 4 }} />
            {SUGGESTIONS.slice(0, 6).map(s => (
              <Button key={s.q} size="small" type="dashed" onClick={() => ask(s.q)} disabled={busy}
                style={{ borderRadius: 12, fontSize: 11 }}>{s.label}</Button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
          <Input
            ref={inputRef}
            placeholder="Ask about revenue, expenses, invoices, customers..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onPressEnter={() => ask()}
            disabled={busy}
            style={{ borderRadius: 20, padding: '6px 16px' }}
          />
          <Button type="primary" shape="circle" icon={<SendOutlined />} loading={busy} onClick={() => ask()} />
        </div>
      </Card>
    </div>
  );
};

export default Assistant;
