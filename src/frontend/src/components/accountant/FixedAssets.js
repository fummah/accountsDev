import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Form, Input, InputNumber, Modal, message, DatePicker, Select, Card, Row, Col, Statistic, Space, Tag, Typography, Popconfirm, Progress, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, DownloadOutlined, SyncOutlined, SearchOutlined, SafetyOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
const { Search } = Input;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHODS = {
  'straight-line': 'Straight Line',
  'reducing-balance': 'Reducing Balance',
  'sum-of-years': 'Sum of Years',
  'units-of-production': 'Units of Production',
  'double-declining': 'Double Declining',
};

const calcDepreciation = (asset) => {
  const cost = Number(asset.purchaseCost || 0);
  const salvage = Number(asset.salvageValue || 0);
  const life = Number(asset.usefulLife || 5);
  const purchaseDate = asset.purchaseDate ? moment(asset.purchaseDate) : null;
  if (!purchaseDate || !cost || life <= 0) return { accumulated: 0, nbv: cost, yearlyDep: 0, pctUsed: 0 };

  const yearsElapsed = Math.max(0, moment().diff(purchaseDate, 'years', true));
  const depreciable = Math.max(0, cost - salvage);
  let accumulated = 0;

  if (asset.depreciationMethod === 'straight-line') {
    const annual = depreciable / life;
    accumulated = Math.min(depreciable, annual * Math.min(yearsElapsed, life));
  } else if (asset.depreciationMethod === 'reducing-balance' || asset.depreciationMethod === 'double-declining') {
    const rate = asset.depreciationMethod === 'double-declining' ? (2 / life) : (1 / life);
    let remaining = cost;
    for (let y = 0; y < Math.min(Math.floor(yearsElapsed), life); y++) {
      const dep = Math.max(0, remaining * rate);
      accumulated += dep;
      remaining -= dep;
      if (remaining <= salvage) { accumulated = depreciable; break; }
    }
    accumulated = Math.min(depreciable, accumulated);
  } else {
    const annual = depreciable / life;
    accumulated = Math.min(depreciable, annual * Math.min(yearsElapsed, life));
  }

  const nbv = cost - accumulated;
  const yearlyDep = depreciable / life;
  const pctUsed = depreciable > 0 ? (accumulated / depreciable * 100) : 0;
  return { accumulated, nbv, yearlyDep, pctUsed };
};

const FixedAssets = () => {
  const { symbol: cSym } = useCurrency();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadAssets(); }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await window.electronAPI.getFixedAssets();
      if (response && response.success && Array.isArray(response.data)) {
        setAssets(response.data);
      } else {
        setAssets([]);
      }
    } catch (error) {
      console.error('Failed to load fixed assets:', error);
      setAssets([]);
    }
    setLoading(false);
  };

  const enrichedAssets = useMemo(() => assets.map(a => {
    const dep = calcDepreciation(a);
    return { ...a, _accumulated: dep.accumulated, _nbv: dep.nbv, _yearlyDep: dep.yearlyDep, _pctUsed: dep.pctUsed };
  }), [assets]);

  const filtered = useMemo(() => enrichedAssets.filter(a => {
    const matchSearch = !searchText ||
      (a.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (a.category || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = statusFilter === 'all' || (a.status || 'Active') === statusFilter;
    return matchSearch && matchStatus;
  }), [enrichedAssets, searchText, statusFilter]);

  const totals = useMemo(() => ({
    cost: filtered.reduce((s, a) => s + Number(a.purchaseCost || 0), 0),
    accumulated: filtered.reduce((s, a) => s + a._accumulated, 0),
    nbv: filtered.reduce((s, a) => s + a._nbv, 0),
    count: filtered.length,
    active: filtered.filter(a => (a.status || 'Active') === 'Active').length,
  }), [filtered]);

  const handleAddEdit = async (values) => {
    try {
      const asset = {
        assetName: values.assetName,
        category: values.category || '',
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
        purchaseCost: Number(values.purchaseCost) || 0,
        salvageValue: Number(values.salvageValue) || 0,
        usefulLife: Number(values.usefulLife) || 5,
        currentValue: Number(values.purchaseCost) || 0,
        depreciationMethod: values.depreciationMethod,
        status: values.status || 'Active',
        entered_by: 'system',
        date_entered: new Date().toISOString(),
      };
      let result;
      if (editingId) {
        result = await window.electronAPI.updateFixedAsset({ ...asset, id: editingId });
      } else {
        result = await window.electronAPI.insertFixedAsset(asset);
      }
      if (result && result.success) {
        message.success(editingId ? 'Asset updated' : 'Asset created');
        setIsModalVisible(false);
        form.resetFields();
        setEditingId(null);
        loadAssets();
      } else {
        message.error(result?.error || 'Operation failed');
      }
    } catch (error) {
      message.error(error.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteFixedAsset(id);
      message.success('Asset deleted');
      loadAssets();
    } catch { message.error('Failed to delete asset'); }
  };

  const handleExport = () => {
    if (!filtered.length) { message.warning('No data to export'); return; }
    const lines = [['Asset Name', 'Category', 'Purchase Date', 'Purchase Cost', 'Salvage Value', 'Useful Life', 'Method', 'Accumulated Dep.', 'Net Book Value', 'Status'].join(',')];
    filtered.forEach(a => {
      lines.push([`"${a.assetName || ''}"`, `"${a.category || ''}"`, a.purchaseDate || '', Number(a.purchaseCost || 0), Number(a.salvageValue || 0), a.usefulLife || 5, a.depreciationMethod || '', a._accumulated.toFixed(2), a._nbv.toFixed(2), a.status || 'Active'].join(','));
    });
    lines.push(['TOTALS', '', '', totals.cost.toFixed(2), '', '', '', totals.accumulated.toFixed(2), totals.nbv.toFixed(2), ''].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fixed-assets-${moment().format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!filtered.length) { message.warning('No data to print'); return; }
    const rowsHtml = filtered.map(a => `<tr><td>${a.assetName || ''}</td><td>${a.category || ''}</td><td>${a.purchaseDate ? moment(a.purchaseDate).format('DD/MM/YYYY') : ''}</td><td style="text-align:right">${fmt(a.purchaseCost)}</td><td style="text-align:right">${fmt(a._accumulated)}</td><td style="text-align:right">${fmt(a._nbv)}</td><td>${METHODS[a.depreciationMethod] || a.depreciationMethod}</td><td>${a.status || 'Active'}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Fixed Assets Register</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5}tfoot td{font-weight:bold;border-top:2px solid #333}</style></head><body><h2>Fixed Assets Register</h2><p>As at ${moment().format('DD MMM YYYY')}</p><table><thead><tr><th>Asset</th><th>Category</th><th>Purchase Date</th><th>Cost</th><th>Accum. Dep.</th><th>NBV</th><th>Method</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Totals (${filtered.length} assets)</td><td style="text-align:right">${fmt(totals.cost)}</td><td style="text-align:right">${fmt(totals.accumulated)}</td><td style="text-align:right">${fmt(totals.nbv)}</td><td colspan="2"></td></tr></tfoot></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const columns = [
    { title: 'Asset Name', dataIndex: 'assetName', key: 'assetName', sorter: (a, b) => (a.assetName || '').localeCompare(b.assetName || ''), render: (v, r) => (<><Text strong>{v}</Text>{r.category ? <><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.category}</Text></> : null}</>) },
    { title: 'Purchase Date', dataIndex: 'purchaseDate', key: 'purchaseDate', width: 110, sorter: (a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate), render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Cost', dataIndex: 'purchaseCost', key: 'purchaseCost', width: 120, align: 'right', sorter: (a, b) => Number(a.purchaseCost) - Number(b.purchaseCost), render: v => <Text>{fmt(v)}</Text> },
    { title: 'Salvage', dataIndex: 'salvageValue', key: 'salvageValue', width: 100, align: 'right', render: v => <Text type="secondary">{fmt(v)}</Text> },
    { title: 'Life (yr)', dataIndex: 'usefulLife', key: 'usefulLife', width: 70, align: 'center', render: v => v || 5 },
    { title: 'Method', dataIndex: 'depreciationMethod', key: 'depreciationMethod', width: 120, render: v => <Tag>{METHODS[v] || v || '-'}</Tag> },
    { title: 'Accum. Dep.', dataIndex: '_accumulated', key: '_accumulated', width: 120, align: 'right', render: v => <Text style={{ color: '#cf1322' }}>{fmt(v)}</Text> },
    { title: 'NBV', dataIndex: '_nbv', key: '_nbv', width: 120, align: 'right', render: v => <Text strong style={{ color: '#1890ff' }}>{fmt(v)}</Text> },
    { title: 'Dep. %', dataIndex: '_pctUsed', key: '_pctUsed', width: 90, render: v => <Progress percent={Math.round(v)} size="small" strokeColor={v >= 90 ? '#ff4d4f' : v >= 50 ? '#faad14' : '#52c41a'} /> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 80, render: v => <Tag color={(v || 'Active') === 'Active' ? 'green' : v === 'Disposed' ? 'red' : 'default'}>{v || 'Active'}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => { setEditingId(record.id); form.setFieldsValue({ ...record, purchaseDate: record.purchaseDate ? moment(record.purchaseDate) : null }); setIsModalVisible(true); }} /></Tooltip>
          <Popconfirm title="Delete this asset?" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><SafetyOutlined style={{ marginRight: 8 }} />Fixed Assets Register</Title>
          <Text type="secondary">Manage fixed assets, depreciation schedules, and net book values</Text>
        </div>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>Export</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadAssets} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setIsModalVisible(true); }}>Add Asset</Button>
        </Space>
      </div>

      {/* Summary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Cost" value={totals.cost} precision={2} prefix={cSym} valueStyle={{ fontSize: 18 }} />
            <Text type="secondary">{totals.count} assets</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Accumulated Depreciation" value={totals.accumulated} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Net Book Value" value={totals.nbv} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="Active Assets" value={totals.active} valueStyle={{ fontSize: 18, color: '#722ed1' }} suffix={`/ ${totals.count}`} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Search placeholder="Search assets..." allowClear onSearch={setSearchText} onChange={e => !e.target.value && setSearchText('')} style={{ width: 250 }} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 130 }}>
            <Option value="all">All Status</Option>
            <Option value="Active">Active</Option>
            <Option value="Disposed">Disposed</Option>
            <Option value="Inactive">Inactive</Option>
          </Select>
        </Space>
      </Card>

      {/* Assets Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} assets` }}
          summary={pageData => {
            if (!pageData.length) return null;
            let pgCost = 0, pgAccum = 0, pgNbv = 0;
            pageData.forEach(r => { pgCost += Number(r.purchaseCost || 0); pgAccum += r._accumulated; pgNbv += r._nbv; });
            return (
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell><Text strong>Totals</Text></Table.Summary.Cell>
                <Table.Summary.Cell />
                <Table.Summary.Cell align="right"><Text strong>{fmt(pgCost)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell />
                <Table.Summary.Cell />
                <Table.Summary.Cell />
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(pgAccum)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(pgNbv)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell />
                <Table.Summary.Cell />
                <Table.Summary.Cell />
              </Table.Summary.Row>
            );
          }}
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editingId ? 'Edit Asset' : 'Add Asset'}
        visible={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); setEditingId(null); }}
        width={640}
        okText="Save"
      >
        <Form form={form} layout="vertical" onFinish={handleAddEdit} initialValues={{ usefulLife: 5, salvageValue: 0, depreciationMethod: 'straight-line', status: 'Active' }}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="assetName" label="Asset Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="e.g. Office Furniture" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="Category">
                <Select allowClear placeholder="Category">
                  <Option value="Equipment">Equipment</Option>
                  <Option value="Furniture">Furniture</Option>
                  <Option value="Vehicles">Vehicles</Option>
                  <Option value="Buildings">Buildings</Option>
                  <Option value="Land">Land</Option>
                  <Option value="Technology">Technology</Option>
                  <Option value="Other">Other</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="purchaseDate" label="Purchase Date" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="purchaseCost" label="Purchase Cost" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix={cSym} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="salvageValue" label="Salvage Value">
                <InputNumber min={0} style={{ width: '100%' }} prefix={cSym} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="usefulLife" label="Useful Life (years)" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="depreciationMethod" label="Depreciation Method" rules={[{ required: true, message: 'Required' }]}>
                <Select>
                  {Object.entries(METHODS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status">
                <Select>
                  <Option value="Active">Active</Option>
                  <Option value="Disposed">Disposed</Option>
                  <Option value="Inactive">Inactive</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default FixedAssets;