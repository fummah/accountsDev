import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Table, Button, Divider, Tag, message, Spin, Typography } from 'antd';
import { FileTextOutlined, PrinterOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import JournalEntryDetailModal from '../../accountant/JournalEntryDetailModal';

const { Text } = Typography;

const fmt = (v, cSym = '$') => {
  const n = Number(v || 0);
  return cSym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PMTN = (id) => `PMT-${String(id).padStart(5, '0')}`;

/* ─── PaymentDetailsModal ────────────────────────────────────────────────────
   Read-only details for one payment: header info, the invoices it was applied
   to (each linkable), the unapplied remainder, and a "View Journal Entry"
   button that opens the exact journal entry for this payment. */
const PaymentDetailsModal = ({ payment, visible, onClose, onPrint }) => {
  const { symbol: cSym } = useCurrency();
  const [allocations, setAllocations] = useState([]);
  const [loadingAlloc, setLoadingAlloc] = useState(false);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [journalDetailId, setJournalDetailId] = useState(null);
  const [refunds, setRefunds] = useState([]);

  useEffect(() => {
    if (!visible || !payment) return;
    setJournalDetailId(null);
    (async () => {
      setLoadingAlloc(true);
      try {
        const res = await window.electronAPI?.customerPaymentAllocations?.(payment.id) || [];
        setAllocations(Array.isArray(res) ? res : []);
      } catch (e) { setAllocations([]); }
      setLoadingAlloc(false);
      try {
        const rf = await window.electronAPI?.customerRefundsByPayment?.(payment.id) || [];
        setRefunds(Array.isArray(rf) ? rf.filter(r => String(r.status || '').toLowerCase() !== 'reversed') : []);
      } catch { setRefunds([]); }
    })();
  }, [visible, payment]);

  const applied = Number(payment?.applied != null ? payment.applied : (payment?.amount || 0));
  const unapplied = Number(payment?.unapplied || 0);
  const refundedTotal = refunds.reduce((s, r) => s + Number(r.amount || 0), 0);
  const netAmount = Math.max(0, Number(payment?.amount || 0) - refundedTotal);
  const refundStatus = refundedTotal <= 0.005 ? 'Applied'
    : netAmount <= 0.005 ? 'Refunded' : 'Partially Refunded';

  const handleGl = async () => {
    if (journalDetailId) { setJournalDetailId(null); return; }
    setLoadingJournal(true);
    try {
      const res = await window.electronAPI?.journalGetBySource?.('payment', payment.id);
      if (res && !res.error && res.id) setJournalDetailId(res.id);
      else message.info('No journal entry posted for this payment');
    } catch (e) { message.error('Failed to load journal entry'); }
    setLoadingJournal(false);
  };

  const appliedColumns = [
    {
      title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 130,
      render: (v, r) => (
        <Link to={`/main/customers/invoices/edit/${r.invoiceId}`}>
          <FileTextOutlined style={{ marginRight: 6 }} />{v || `#${r.invoiceId}`}
        </Link>
      ),
    },
    {
      title: 'Invoice Total', dataIndex: 'invoiceTotal', key: 'invoiceTotal', align: 'right', width: 130,
      render: v => fmt(v, cSym),
    },
    {
      title: 'Applied', dataIndex: 'amount', key: 'amount', align: 'right', width: 120,
      render: v => <Text strong style={{ color: '#52c41a' }}>{fmt(v, cSym)}</Text>,
    },
    {
      title: 'Remaining', key: 'remaining', align: 'right', width: 120,
      render: (_, r) => {
        const rem = Math.max(0, (Number(r.invoiceTotal) || 0) - (Number(r.appliedTotal) || 0));
        return <Text style={{ color: rem > 0 ? '#fa541c' : '#52c41a' }}>{fmt(rem, cSym)}</Text>;
      },
    },
  ];

  return (
    <>
      <Modal
        title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />Payment {PMTN(payment?.id)}</span>}
        visible={visible}
        onCancel={() => onClose()}
        footer={[
          <Button key="gl" icon={<LinkOutlined />} loading={loadingJournal} onClick={handleGl}>View Journal Entry</Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={() => onPrint && onPrint(payment)}>Print Receipt</Button>,
          <Button key="close" onClick={() => onClose()}>Close</Button>,
        ]}
        width={640}
      >
        {payment && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Payment #">{PMTN(payment.id)}</Descriptions.Item>
              <Descriptions.Item label="Customer">{payment.customerName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Date">{payment.date ? moment(payment.date).format('MM/DD/YYYY') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Method">{payment.paymentMethod || '—'}</Descriptions.Item>
              <Descriptions.Item label="Amount"><Text strong>{fmt(payment.amount, cSym)}</Text></Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={refundStatus === 'Refunded' ? 'red' : refundStatus === 'Partially Refunded' ? 'orange' : 'green'}>{refundStatus}</Tag></Descriptions.Item>
              <Descriptions.Item label="Applied">{fmt(applied, cSym)}</Descriptions.Item>
              <Descriptions.Item label="Unapplied">
                <Text strong style={{ color: unapplied > 0 ? '#faad14' : '#52c41a' }}>{fmt(unapplied, cSym)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Refunded"><Text strong style={{ color: refundedTotal > 0 ? '#cf1322' : undefined }}>{fmt(refundedTotal, cSym)}</Text></Descriptions.Item>
              <Descriptions.Item label="Net Amount"><Text strong>{fmt(netAmount, cSym)}</Text></Descriptions.Item>
              <Descriptions.Item label="Reference">{payment.reference || '—'}</Descriptions.Item>
              <Descriptions.Item label="Deposit To">{payment.deposit_to || payment.depositTo || 'Undeposited Funds'}</Descriptions.Item>
            </Descriptions>

            {refunds.length > 0 && (
              <>
                <Divider style={{ margin: '16px 0 12px' }}>Refund History</Divider>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={refunds}
                  columns={[
                    { title: 'Refund #', dataIndex: 'refund_number', key: 'refund_number', render: v => v || '—' },
                    { title: 'Date', dataIndex: 'date', key: 'date', render: d => d ? moment(d).format('MM/DD/YYYY') : '—' },
                    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => <Text strong style={{ color: '#cf1322' }}>-{fmt(v, cSym)}</Text> },
                    { title: 'Reason', dataIndex: 'reason', key: 'reason', render: v => v || '—' },
                  ]}
                />
              </>
            )}

            {payment.memo && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary"><Text strong>Memo:</Text> {payment.memo}</Text>
              </div>
            )}

            <Divider style={{ margin: '16px 0 12px' }}>Applied To</Divider>
            <Spin spinning={loadingAlloc}>
              {allocations.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '8px 0' }}>
                  <Tag color="gold">Unapplied payment — no invoices selected</Tag>
                </div>
              ) : (
                <Table
                  columns={appliedColumns}
                  dataSource={allocations}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )}
            </Spin>
          </>
        )}
      </Modal>

      <JournalEntryDetailModal
        journalEntryId={journalDetailId}
        visible={!!journalDetailId}
        onClose={() => setJournalDetailId(null)}
      />
    </>
  );
};

export default PaymentDetailsModal;