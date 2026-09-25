import React, { useEffect, useRef, useState } from 'react';
import { Card, Space, Select, Input, Typography } from 'antd';
import AttachmentManager from '../shared/AttachmentManager';

const { Option } = Select;
const { Text } = Typography;

/**
 * Document Center — the application-wide attachment browser.
 *
 * It uses the SAME AttachmentManager as the record forms (Bill, Check, Credit
 * Card Charge), so listing, opening and removing documents is one code path and
 * one storage service. Uploads here are persisted immediately (autoUpload)
 * against the selected category + linked record.
 */
const DocumentCenter = () => {
  const [category, setCategory] = useState('receipt');
  const [linkedId, setLinkedId] = useState('');
  const [txs, setTxs] = useState([]);
  const attachmentRef = useRef(null);

  const loadTxs = async () => {
    try {
      const list = await window.electronAPI.getTransactions?.();
      if (Array.isArray(list)) setTxs(list.slice(-200).reverse());
    } catch {}
  };
  useEffect(() => { loadTxs(); }, []);

  return (
    <div className="gx-p-4">
      <Card title="Document Center">
        <Space style={{ marginBottom: 12 }} wrap>
          <span>Category:</span>
          <Select value={category} onChange={setCategory} style={{ width: 160 }}>
            <Option value="receipt">Receipt</Option>
            <Option value="contract">Contract</Option>
            <Option value="invoice">Invoice</Option>
            <Option value="bill">Bill</Option>
            <Option value="expense">Expense</Option>
            <Option value="other">Other</Option>
          </Select>
          <Input
            placeholder="Linked Record Id (optional)"
            value={linkedId}
            onChange={(e) => setLinkedId(e.target.value)}
            style={{ width: 220 }}
          />
          <Select
            showSearch
            allowClear
            placeholder="Link to recent transaction"
            style={{ minWidth: 320 }}
            value={linkedId || undefined}
            onChange={(v) => setLinkedId(v || '')}
            optionFilterProp="label"
            options={txs.map(t => ({
              value: t.id,
              label: `${t.id} | ${t.date || ''} | ${t.description || ''} | ${Number((t.debit || 0) - (t.credit || 0)).toFixed(2)}`,
            }))}
          />
        </Space>

        <AttachmentManager
          ref={attachmentRef}
          entityType={category}
          entityId={linkedId}
          autoUpload
          entityLabel={category}
          emptyText="No documents for this category yet."
          onChanged={() => {}}
        />

        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Files are stored in AccuLedger's managed attachment folder and can be opened or removed at any time.
        </Text>
      </Card>
    </div>
  );
};

export default DocumentCenter;
