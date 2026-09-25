import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, Select, message, Tag, Space, Row, Col, Typography, Empty } from 'antd';
import { PlusOutlined, SwapOutlined, HistoryOutlined, FileTextOutlined, EditOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Text } = Typography;

const creditStatusColor = (s) => {
  const v = (s || '').toLowerCase();
  if (v === 'active') return 'blue';
  if (v === 'applied') return 'green';
  if (v === 'voided') return 'red';
  return 'default';
};

const VendorCredits = ({ history }) => {
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  const [appsByCredit, setAppsByCredit] = useState({});

  const loadApps = async (creditId) => {
    if (appsByCredit[creditId]) return;
    try {
      const a = await window.electronAPI.vendorCreditApplications?.(creditId);
      setAppsByCredit(prev => ({ ...prev, [creditId]: Array.isArray(a) ? a : [] }));
    } catch { setAppsByCredit(prev => ({ ...prev, [creditId]: [] })); }
  };

  useEffect(() => { loadCredits(); loadSuppliers(); }, []);

  const loadCredits = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.vendorCreditsList();
      setCredits(Array.isArray(data) ? data : []);
    } catch { setCredits([]); } finally { setLoading(false); }
  };

  const loadSuppliers = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setSuppliers(Array.isArray(data) ? data : (data?.all || data?.data || []));
    } catch {}
  };

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setShowModal(true);
  };

  const openEdit = async (record) => {
    try {
      setEditingId(record.id);
      form.setFieldsValue({
        supplier_id: record.supplier_id,
        date: record.date ? moment(record.date) : moment(),
        amount: Number(record.amount || 0),
        reference: record.reference || '',
        memo: record.memo || '',
      });
      setShowModal(true);
    } catch { message.error('Failed to load credit'); }
  };

  const handleSave = async (values) => {
    try {
      setLoading(true);
      const payload = {
        supplier_id: values.supplier_id,
        date: values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        amount: Number(values.amount) || 0,
        reference: values.reference || '',
        memo: values.memo || '',
      };
      let res;
      if (editingId) {
        res = await window.electronAPI.vendorCreditsUpdate?.(editingId, payload);
      } else {
        res = await window.electronAPI.vendorCreditsCreate(payload);
      }
      if (res && res.success) {
        message.success(editingId ? 'Vendor credit updated' : 'Vendor credit created');
        setShowModal(false);
        setEditingId(null);
        form.resetFields();
        await loadCredits();
      } else {
        message.error(res?.error || 'Failed to save credit');
      }
    } catch (err) {
      message.error('Failed to save credit');
    } finally { setLoading(false); }
  };

  const handleVoid = (record) => {
    Modal.confirm({
      title: 'Void Vendor Credit?',
      content: `Void credit of ${cSym} ${Number(record.amount).toFixed(2)} for ${record.supplier_name}?`,
      okText: 'Void',
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await window.electronAPI.vendorCreditsVoid(record.id);
          if (res?.success) {
            message.success('Credit voided');
            await loadCredits();
          } else {
            message.error(res?.error || 'Failed to void credit');
          }
        } catch { message.error('Failed to void credit'); }
      },
    });
  };

  const columns = [
    { title: 'Vendor', dataIndex: 'supplier_name', key: 'supplier_name' },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Reference', dataIndex: 'reference', key: 'reference' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: a => `${cSym} ${Number(a || 0).toFixed(2)}` },
    { title: 'Remaining', dataIndex: 'remaining_amount', key: 'remaining_amount', width: 120, align: 'right',
      render: v => <Text strong={Number(v) > 0}>{cSym} ${Math.max(0, Number(v || 0)).toFixed(2)}</Text> },
    { title: 'Memo', dataIndex: 'memo', key: 'memo', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: s => <Tag color={creditStatusColor(s)}>{s || 'Active'}</Tag> },
    { title: 'Actions', key: 'actions', width: 160,
      render: (_, r) => (
        r.status === 'Active'
          ? <Space>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
              <Button size="small" danger onClick={() => handleVoid(r)}>Void</Button>
            </Space>
          : null
      ),
    },
  ];

  const expandedRowRender = (record) => {
    const apps = appsByCredit[record.id];
    if (!apps) return <Text type="secondary">Loading applications...</Text>;
    if (!apps.length) return <Text type="secondary">Not applied to any bill yet.</Text>;
    return (
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={apps}
        columns={[
          { title: 'Bill', dataIndex: 'bill_ref', key: 'bill_ref', render: (v, r) => <a onClick={() => history?.push(`/main/vendors/bills/edit/${r.expense_id}`)}>{v || `#${r.expense_id}`}</a> },
          { title: 'Date', dataIndex: 'applied_date', key: 'applied_date', render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
          { title: 'Amount Applied', dataIndex: 'amount', key: 'amount', align: 'right', render: a => `${cSym} ${Number(a || 0).toFixed(2)}` },
        ]}
      />
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}><SwapOutlined style={{ marginRight: 8 }} />Vendor Credits</h2>
        <Space>
          <Button icon={<FileTextOutlined />} onClick={() => history?.push('/main/vendors/bills/tracker')}>
            Bill Management
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Credit
          </Button>
        </Space>
      </div>

      <Card>
        {credits.length === 0 && !loading ? (
          <Empty description="No vendor credits yet. Create one to get started." />
        ) : (
          <Table dataSource={credits} columns={columns} rowKey="id" loading={loading} size="small"
            expandable={{ expandedRowRender, onExpand: (expanded, record) => { if (expanded) loadApps(record.id); } }}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: t => `${t} credits` }} />
        )}
      </Card>

      <Modal
        title={editingId ? 'Edit Vendor Credit' : 'New Vendor Credit'}
        visible={showModal}
        onOk={() => form.submit()}
        onCancel={() => { setShowModal(false); setEditingId(null); form.resetFields(); }}
        okText={editingId ? 'Update' : 'Create'}
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave} preserve={false}>
          <Form.Item name="supplier_id" label="Vendor" rules={[{ required: true, message: 'Select a vendor' }]}>
            <Select placeholder="Select vendor" showSearch optionFilterProp="children">
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.display_name || s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim()}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter amount' }]}>
                <InputNumber min={0} step={0.01} prefix={cSym} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reference" label="Reference">
            <Input placeholder="Credit memo number or reference" />
          </Form.Item>
          <Form.Item name="memo" label="Memo">
            <Input.TextArea rows={2} placeholder="Optional notes" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VendorCredits;
