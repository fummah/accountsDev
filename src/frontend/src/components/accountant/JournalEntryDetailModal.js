import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Tag, Alert, Spin, Typography, Row, Col } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import { SOURCE_LABELS, SOURCE_COLORS, getSourceTransactionRoute } from '../../utils/sourceRoutes';

const { Text } = Typography;

/* ─── JournalEntryDetailModal ───────────────────────────────────────────────
   Read-only detail for ONE journal entry, loaded by its unique id via
   journalGetById. Shows the full header, every debit/credit line with totals
   and a Balanced indicator, the source transaction summary, and a
   "View Source Transaction" button that navigates to the exact original
   transaction (never to the Journal Entries list). Manual / reversal /
   missing-source entries degrade gracefully. */
const JournalEntryDetailModal = ({ journalEntryId, visible, onClose }) => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [entry, setEntry] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !journalEntryId) return;
    let alive = true;
    setLoading(true);
    setEntry(null);
    setSource(null);
    (async () => {
      try {
        const je = await window.electronAPI.journalGetById?.(journalEntryId);
        if (!alive) return;
        if (!je || je.error) { setEntry(null); return; }
        setEntry(je);
        if (je.source_type && je.source_id != null && je.source_id !== '') {
          try {
            const src = await window.electronAPI.journalSourceDetail?.(je.source_type, je.source_id);
            if (alive) setSource(src && !src.error ? src : null);
          } catch { if (alive) setSource(null); }
        }
      } catch { if (alive) setEntry(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [visible, journalEntryId]);

  const lines = Array.isArray(entry?.lines) ? entry.lines : [];
  const debitTotal = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const creditTotal = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005;
  const st = entry?.source_type;
  const sourceLabel = st ? (SOURCE_LABELS[st] || String(st).replace(/_/g, ' ')) : 'Manual Entry';
  const route = entry && st ? getSourceTransactionRoute(st, entry.source_id, source || {}, entry.id) : null;

  const handleViewSource = () => {
    if (!route) return;
    onClose();
    history.push(route);
  };

  const lineColumns = [
    { title: '#', key: 'idx', width: 44, align: 'center', render: (_, __, i) => <Text type="secondary">{i + 1}</Text> },
    { title: 'Account', key: 'account', width: 280, render: (_, l) => (
      <div>
        <Text strong>{l.accountName || l.account || '-'}</Text>
        {l.accountNumber ? <div><Text type="secondary" style={{ fontSize: 11 }}># {l.accountNumber}</Text></div> : null}
      </div>
    )},
    { title: 'Description / Memo', dataIndex: 'description', key: 'description', render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 130, align: 'right', render: v => Number(v) > 0 ? <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 130, align: 'right', render: v => Number(v) > 0 ? <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
  ];

  const sourceInfo = [
    source?.label || sourceLabel,
    source?.number || entry?.reference || '',
    source?.party || '',
    source?.date ? moment(source.date).format('MM/DD/YYYY') : '',
    source && source.total != null ? fmtC(source.total) : '',
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      title={entry ? <span><FileTextOutlined style={{ marginRight: 8 }} />Journal Entry #{entry.id}</span> : 'Journal Entry'}
      visible={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        route
          ? <Button key="src" type="primary" icon={<FileTextOutlined />} onClick={handleViewSource}>View Source Transaction</Button>
          : null,
      ]}
      width={820}
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading journal entry..." /></div>
      ) : entry ? (
        <div>
          <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Date</Text><div style={{ fontWeight: 600 }}>{entry.date ? moment(entry.date).format('MM/DD/YYYY') : '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Reference</Text><div style={{ fontWeight: 600 }}>{entry.reference || '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Status</Text><div><Tag color={String(entry.status || '').toLowerCase() === 'posted' ? 'success' : 'default'} style={{ borderRadius: 4 }}>{entry.status || '—'}</Tag></div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Balance</Text><div><Tag color={balanced ? 'success' : 'error'} style={{ borderRadius: 4 }}>{balanced ? 'Balanced' : 'Out of Balance'}</Tag></div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source Type</Text><div><Tag color={SOURCE_COLORS[st] || 'default'} style={{ borderRadius: 4 }}>{sourceLabel}</Tag></div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source #</Text><div style={{ fontWeight: 600 }}>{source?.number || (st ? '—' : '—')}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Entered By</Text><div style={{ fontWeight: 600 }}>{entry.entered_by || entry.created_by || '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Entity</Text><div style={{ fontWeight: 600 }}>{entry.entity_id || '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Class</Text><div style={{ fontWeight: 600 }}>{entry.class || '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Location</Text><div style={{ fontWeight: 600 }}>{entry.location || '—'}</div></Col>
            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Department</Text><div style={{ fontWeight: 600 }}>{entry.department || '—'}</div></Col>
          </Row>

          {entry.description ? (
            <div style={{ marginBottom: 12, padding: 10, background: '#fafafa', borderRadius: 8 }}>
              <Text strong>Description: </Text><Text>{entry.description}</Text>
            </div>
          ) : null}
          {entry.memo ? (
            <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }} message={<span><Text strong>Memo / Notes: </Text>{entry.memo}</span>} />
          ) : null}

          {st && (
            <div style={{ marginBottom: 12, padding: 10, background: '#f0f5ff', borderRadius: 8 }}>
              <Text strong style={{ color: '#1890ff' }}>Source Transaction: </Text>
              {sourceInfo ? <Text>{sourceInfo}</Text> : <Text type="secondary">Source transaction unavailable</Text>}
            </div>
          )}

          <Table
            columns={lineColumns}
            dataSource={lines.map((l, i) => ({ ...l, key: i }))}
            size="small" pagination={false} bordered
            summary={() => (
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell colSpan={3}><Text strong>Totals ({lines.length} lines)</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmtC(debitTotal)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(creditTotal)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      ) : (
        <Alert type="warning" showIcon message="Could not load the journal entry." />
      )}
    </Modal>
  );
};

export default JournalEntryDetailModal;