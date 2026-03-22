import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, List, message, Tag } from 'antd';

const Assistant = () => {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [items]);

  const ask = async () => {
    if (!q.trim()) return;
    try {
      setBusy(true);
      const resp = await window.electronAPI.assistantAsk?.(q);
      setItems(prev => [...prev, { role: 'user', text: q }, { role: 'assistant', data: resp }]);
      setQ('');
    } catch (e) {
      message.error(e?.message || 'Assistant error');
    } finally { setBusy(false); }
  };

  const renderKpi = (data) => {
    if (!data || typeof data !== 'object') return null;
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0' }}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={{ padding: '4px 10px', background: '#f5f5f5', borderRadius: 4, border: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{String(v)}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderListRow = (r, idx) => {
    if (typeof r === 'object') {
      const entries = Object.entries(r).filter(([k]) => k !== 'id').slice(0, 6);
      return <li key={r.id || idx}>{entries.map(([k, v]) => <span key={k}><Tag>{k}</Tag>{String(v ?? '')} </span>)}</li>;
    }
    return <li key={idx}>{String(r)}</li>;
  };

  const renderItem = (it, idx) => {
    if (it.role === 'user') return (
      <div key={idx} style={{ padding: '6px 12px', background: '#e6f7ff', borderRadius: 8, marginBottom: 4 }}>
        <b>You:</b> {it.text}
      </div>
    );
    const d = it.data || {};

    if (d.answerType === 'kpi') return (
      <div key={idx} style={{ padding: '6px 12px', marginBottom: 4 }}>
        <b>Assistant:</b>
        {d.summary && <div style={{ marginBottom: 4, color: '#333' }}>{d.summary}</div>}
        {renderKpi(d.data)}
      </div>
    );

    if (d.answerType === 'list') return (
      <div key={idx} style={{ padding: '6px 12px', marginBottom: 4 }}>
        <b>Assistant:</b>
        {d.summary && <div style={{ marginBottom: 4, color: '#333' }}>{d.summary}</div>}
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 300, overflowY: 'auto' }}>
          {(Array.isArray(d.data) ? d.data : []).slice(0, 20).map((r, i) => renderListRow(r, i))}
        </ul>
      </div>
    );

    // Text type (including help with newlines)
    const textContent = String(d?.data || '');
    return (
      <div key={idx} style={{ padding: '6px 12px', marginBottom: 4 }}>
        <b>Assistant:</b>
        {d.summary && <div style={{ marginBottom: 4, color: '#333' }}>{d.summary}</div>}
        <div style={{ whiteSpace: 'pre-wrap' }}>{textContent}</div>
      </div>
    );
  };

  return (
    <div className="gx-p-4">
      <Card title="AI Assistant" extra={<Tag color="blue">17 skills available</Tag>}>
        <div style={{ maxHeight: 500, overflowY: 'auto', marginBottom: 12 }}>
          <List dataSource={items} renderItem={(it, idx) => <List.Item style={{ border: 'none', padding: '2px 0' }}>{renderItem(it, idx)}</List.Item>} />
          <div ref={bottomRef} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input placeholder='Try "help", "overdue invoices", "profit margin", "top customers"...' value={q} onChange={e => setQ(e.target.value)} onPressEnter={ask} />
          <Button type="primary" loading={busy} onClick={ask}>Ask</Button>
        </div>
      </Card>
    </div>
  );
};

export default Assistant;
