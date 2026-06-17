import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, Select, message, Tag, Space, Row, Col, Typography, Empty } from 'antd';
import { PlusOutlined, SwapOutlined, HistoryOutlined, FileTextOutlined } from '@ant-design/icons';
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
  const [form] = Form.useForm();

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

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const res = await window.electronAPI.vendorCreditsCreate({
        supplier_id: values.supplier_id,
        date: values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        amount: Number(values.amount) || 0,
        reference: values.reference || '',
        memo: values.memo || '',
      });
      if (res && res.success) {
        message.success('Vendor credit created');
        setShowModal(false);
        form.resetFields();
        await loadCredits();
      } else {
        message.error(res?.error || 'Failed to create credit');
      }
    } catch (err) {
      message.error('Failed to create credit');
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
    { title: 'Actions', key: 'actions', width: 80,
      render: (_, r) => (
        r.status === 'Active'
          ? <Button size="small" danger onClick={() => handleVoid(r)}>Void</Button>
          : null
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}><SwapOutlined style={{ marginRight: 8 }} />Vendor Credits</h2>
        <Space>
          <Button icon={<FileTextOutlined />} onClick={() => history?.push('/main/vendors/bills/tracker')}>
            Bill Tracker
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowModal(true)}>
            New Credit
          </Button>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={credits} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, showTotal: t => `${t} credits` }} size="middle"
          locale={{ emptyText: <Empty description="No vendor credits yet" /> }} />
      </Card>

      <Modal title="Create Vendor Credit" visible={showModal} onOk={() => form.submit()}
        onCancel={() => { setShowModal(false); form.resetFields(); }}
        confirmLoading={loading} okText="Create Credit" width={520} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreate} preserve={false}>
          <Form.Item name="supplier_id" label="Vendor" rules={[{ required: true, message: 'Select vendor' }]}>
            <Select showSearch optionFilterProp="children" placeholder="Select vendor">
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.display_name || `${s.first_name} ${s.last_name}`}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="date" label="Credit Date" initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter amount' }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} prefix={cSym} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reference" label="Reference / Credit Note #">
            <Input placeholder="e.g. CN-001" />
          </Form.Item>
          <Form.Item name="memo" label="Memo">
            <Input.TextArea rows={2} placeholder="Reason for credit" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VendorCredits;
