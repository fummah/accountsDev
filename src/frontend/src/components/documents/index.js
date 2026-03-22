import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Table, Space, Select, Input, Upload, message } from 'antd';

const { Option } = Select;
const { Dragger } = Upload;

const DocumentCenter = () => {
  const [docs, setDocs] = useState([]);
  const [category, setCategory] = useState('receipt');
  const [linkedId, setLinkedId] = useState('');
  const [txs, setTxs] = useState([]);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const list = await window.electronAPI.getDocuments(category, linkedId);
      if (Array.isArray(list)) setDocs(list);
    } catch (e) {
      message.error(String(e?.message || e));
    }
  };
  useEffect(() => { load(); }, [category, linkedId]);

  const loadTxs = async () => {
    try {
      const list = await window.electronAPI.getTransactions?.();
      if (Array.isArray(list)) {
        const recent = list.slice(-200).reverse();
        setTxs(recent);
      }
    } catch {}
  };
  useEffect(() => { loadTxs(); }, []);

  const doUpload = async (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result || '').toString();
        const res = await window.electronAPI.uploadDocument({
          name: file.name,
          mime: file.type,
          data: base64,
          category,
          linkedId,
        });
        if (res?.success) {
          message.success('Uploaded');
          await load();
        } else {
          message.error(res?.error || 'Upload failed');
        }
      } catch (e) {
        message.error(String(e?.message || e));
      }
    };
    reader.readAsDataURL(file);
  };

  const beforeUpload = (file) => {
    doUpload(file);
    return false;
  };

  const dragProps = {
    name: 'file',
    multiple: true,
    beforeUpload: (file) => beforeUpload(file),
    fileList: [],
    showUploadList: false,
  };

  const openDoc = async (id) => {
    const res = await window.electronAPI.openDocument(id);
    if (!res?.success) {
      message.error(res?.message || 'Unable to open file');
    }
  };

  const deleteDoc = async (id) => {
    const res = await window.electronAPI.deleteDocument(id);
    if (res?.success) {
      message.success('Deleted');
      await load();
    } else {
      message.error(res?.error || 'Delete failed');
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'document_name', key: 'name' },
    { title: 'Type', dataIndex: 'document_type', key: 'type' },
    { title: 'Size', dataIndex: 'document_size', key: 'size' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Linked ID', dataIndex: 'linked_id', key: 'linked' },
    { title: 'Date', dataIndex: 'date_entered', key: 'date' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openDoc(r.id)}>Open</Button>
          <Button size="small" danger onClick={() => deleteDoc(r.id)}>Delete</Button>
        </Space>
      )
    }
  ];

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
              label: `${t.id} | ${t.date || ''} | ${t.description || ''} | ${Number((t.debit||0)-(t.credit||0)).toFixed(2)}`
            }))}
          />
          <Upload beforeUpload={beforeUpload} fileList={[]} showUploadList={false}>
            <Button type="primary">Upload File</Button>
          </Upload>
        </Space>
        <Dragger {...dragProps}>
          <p className="ant-upload-drag-icon">Drop files here to upload</p>
          <p className="ant-upload-text">Drag & drop documents to attach them to the selected category and linked record.</p>
        </Dragger>
        <Table rowKey="id" dataSource={Array.isArray(docs) ? docs : []} columns={columns} size="small" style={{ marginTop: 12 }} pagination={{ pageSize: 20, showSizeChanger: true }} />
      </Card>
    </div>
  );
};

function useMount(effect) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { effect(); }, []);
}

export default DocumentCenter;


