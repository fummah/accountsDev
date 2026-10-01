import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Card, Row, Col, Select, InputNumber, Input, Button, message, DatePicker, Radio, Table,
  Tag, Space, Typography, Modal, Descriptions, Drawer, Alert, Tooltip, Empty,
} from 'antd';
import {
  ReloadOutlined, HistoryOutlined, PlusOutlined, MinusOutlined, EditOutlined, EyeOutlined,
  RollbackOutlined, BookOutlined, ShoppingOutlined, FileTextOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { tracksInventory } from '../../../utils/itemTypes';
import FormSection from '../../shared/FormSection';

const { Text } = Typography;
const { TextArea } = Input;

const REASONS = ['Damaged', 'Lost', 'Found', 'Physical Count', 'Correction'];
const NEGATIVE_REASONS = ['Damaged', 'Lost'];
const POSITIVE_REASONS = ['Found'];

const Adjustments = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const historyRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [productId, setProductId] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [adjDate, setAdjDate] = useState(moment());
  const [reason, setReason] = useState(null);
  const [reasonDetails, setReasonDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [adjType, setAdjType] = useState('increase');
  const [qty, setQty] = useState(1);
  const [countedQty, setCountedQty] = useState(null);
  const [unitCostInput, setUnitCostInput] = useState(null);
  const [posting, setPosting] = useState(false);
  const requestIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [hFilters, setHFilters] = useState({ search: '', reason: 'all', warehouseId: 'all', direction: 'all', range: null });

  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadLookups = useCallback(async () => {
    try {
      const [prods, whs] = await Promise.all([
        window.electronAPI.getAllProducts?.().catch(() => []),
        window.electronAPI.getWarehouses?.().catch(() => []),
      ]);
      const list = (Array.isArray(prods) ? prods : (prods?.all || prods?.data || [])).filter((p) => tracksInventory(p.type));
      setProducts(list);
      const wlist = Array.isArray(whs) ? whs : [];
      setWarehouses(wlist);
      if (wlist.length) setWarehouseId((wlist.find((w) => w.isDefault) || wlist[0]).id);
    } catch (e) { console.error('[adjustments] lookups failed:', e); }
  }, []);

  const loadHistory = useCallback(async (f = hFilters) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const fn = window.electronAPI.getAdjustments;
      if (!fn) throw new Error('Adjustment history is unavailable in this build.');
      const rows = await fn({
        search: f.search || undefined,
        reason: f.reason !== 'all' ? f.reason : undefined,
        warehouseId: f.warehouseId !== 'all' ? f.warehouseId : undefined,
        direction: f.direction !== 'all' ? f.direction : undefined,
        dateFrom: f.range && f.range[0] ? f.range[0].format('YYYY-MM-DD') : undefined,
        dateTo: f.range && f.range[1] ? f.range[1].format('YYYY-MM-DD') : undefined,
      });
      if (rows && rows.error) throw new Error(rows.error);
      setHistoryRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('[adjustments] history failed:', e);
      setHistoryError(e?.message || String(e));
      setHistoryRows([]);
    } finally { setHistoryLoading(false); }
  }, [hFilters]);

  useEffect(() => { loadLookups(); }, [loadLookups]);
  useEffect(() => { loadHistory(hFilters); /* eslint-disable-next-line */ }, [hFilters]);

  const loadContext = useCallback(async (pid) => {
    if (!pid) { setCtx(null); return; }
    try {
      const res = await window.electronAPI.getAdjustmentContext?.(Number(pid));
      setCtx(res && !res.error ? res : null);
    } catch { setCtx(null); }
  }, []);

  const onSelectProduct = (v) => { setProductId(v); loadContext(v); };

  const currentQty = useMemo(() => {
    if (!ctx) return 0;
    const ws = ctx.warehouseStock || [];
    if (ws.length && warehouseId != null) {
      const row = ws.find((w) => Number(w.warehouseId) === Number(warehouseId));
      return row ? Number(row.quantity) : 0;
    }
    return Number(ctx.onHand) || 0;
  }, [ctx, warehouseId]);

  const signedQty = useMemo(() => {
    if (adjType === 'count') {
      const c = Number(countedQty);
      return Number.isFinite(c) ? c - currentQty : 0;
    }
    const q = Number(qty) || 0;
    return adjType === 'decrease' ? -Math.abs(q) : Math.abs(q);
  }, [adjType, qty, countedQty, currentQty]);

  const newQty = currentQty + signedQty;
  const needsCostBasis = signedQty > 0 && Number(ctx?.unitCost || 0) <= 0;
  const effectiveUnitCost = needsCostBasis && unitCostInput != null && unitCostInput !== ''
    ? Number(unitCostInput)
    : Number(ctx?.unitCost || 0);
  const valueChange = signedQty * effectiveUnitCost;
  const currentValue = Number(ctx?.inventoryValue || 0);
  const newValue = currentValue + valueChange;

  const negativeWarning = signedQty < 0 && newQty < 0;
  const directionWarning = (NEGATIVE_REASONS.includes(reason) && signedQty > 0) || (POSITIVE_REASONS.includes(reason) && signedQty < 0);

  const canPost = !!ctx && !!warehouseId && !!reason && signedQty !== 0 && !posting;

  const resetForm = () => {
    setQty(1); setCountedQty(null); setReason(null); setReasonDetails(''); setNotes('');
    setUnitCostInput(null); setAdjType('increase');
    requestIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const doPost = async () => {
    setPosting(true);
    try {
      const opts = {
        itemId: ctx.itemId, warehouseId: Number(warehouseId), quantity: signedQty,
        reason, reasonDetails: reasonDetails || null, notes: notes || null,
        adjustmentDate: adjDate ? adjDate.format('YYYY-MM-DD') : undefined,
        productId: Number(productId), createdBy: 'user',
        requestId: requestIdRef.current,
      };
      if (needsCostBasis && unitCostInput != null && unitCostInput !== '') opts.unitCost = Number(unitCostInput);
      const res = await window.electronAPI.adjustInventory(opts);
      if (!res || res.success === false || res.error) throw new Error((res && res.error) || 'Adjustment failed');
      const verb = signedQty > 0 ? 'increased' : 'decreased';
      message.success(`Inventory adjustment ${res.reference} posted successfully.`);
      message.info(`${ctx.productName || ''} ${verb} by ${Math.abs(signedQty)} units. New quantity: ${res.qtyAfter}.`);
      resetForm();
      await loadContext(productId);
      loadHistory(hFilters);
    } catch (e) {
      message.error(e?.message || 'Adjustment failed');
    } finally { setPosting(false); }
  };

  const confirmPost = () => {
    if (!canPost) return;
    Modal.confirm({
      title: 'Post Inventory Adjustment?',
      okText: 'Post Adjustment',
      content: (
        <div>
          <div>{ctx.productName} {ctx.sku ? `(${ctx.sku})` : ''}</div>
          <div>Current: {currentQty} · Adjustment: {signedQty > 0 ? `+${signedQty}` : signedQty} · New: {newQty}</div>
          <div>Reason: {reason}</div>
          <div>Inventory value change: {money(valueChange)}</div>
          {negativeWarning && <Text type="danger">This will make stock negative.</Text>}
          {directionWarning && <Text type="warning">{reason} usually changes stock the other way — please confirm.</Text>}
        </div>
      ),
      onOk: doPost,
    });
  };

  const openDetail = async (row) => {
    setDetail(row);
    setDetailOpen(true);
    try {
      const d = await window.electronAPI.getAdjustment?.(row.id);
      if (d && !d.error) setDetail(d);
    } catch { /* keep row */ }
  };

  const reverse = async (row) => {
    Modal.confirm({
      title: `Reverse ${row.reference}?`,
      content: 'A reversing adjustment will be posted. Both records are preserved.',
      okText: 'Reverse', okButtonProps: { danger: true },
      onOk: async () => {
        const res = await window.electronAPI.reverseAdjustment?.(row.id, { createdBy: 'user' });
        if (res?.success) { message.success(`Reversed — ${res.reference} posted.`); setDetailOpen(false); loadHistory(hFilters); if (productId) loadContext(productId); }
        else message.error(res?.error || 'Reverse failed');
      },
    });
  };

  const historyColumns = [
    { title: 'Date', dataIndex: 'adjustmentDate', key: 'date', width: 110, render: (v) => v ? moment(v).format('DD MMM YYYY') : '—' },
    { title: 'Adjustment #', dataIndex: 'reference', key: 'ref', width: 130, render: (v, r) => <a onClick={() => openDetail(r)} style={{ fontWeight: 600 }}>{v || `#${r.id}`}</a> },
    { title: 'Item', dataIndex: 'productName', key: 'item', ellipsis: true, render: (v) => v || '—' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 110, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'wh', width: 130, render: (v) => v || '—' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', width: 120, render: (v) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Before', dataIndex: 'qtyBefore', key: 'before', width: 80, align: 'right' },
    { title: 'Adjustment', dataIndex: 'quantity', key: 'qty', width: 100, align: 'right', sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
      render: (v) => <Text strong style={{ color: Number(v) > 0 ? '#3f8600' : '#cf1322' }}>{Number(v) > 0 ? `+${Number(v)}` : Number(v)}</Text> },
    { title: 'After', dataIndex: 'qtyAfter', key: 'after', width: 80, align: 'right' },
    { title: 'Value Change', dataIndex: 'valueChange', key: 'vc', width: 120, align: 'right', render: (v) => <Text style={{ color: Number(v) < 0 ? '#cf1322' : Number(v) > 0 ? '#3f8600' : undefined }}>{money(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (v) => <Tag color={String(v) === 'Reversed' ? 'red' : 'green'}>{v || 'Posted'}</Tag> },
    { title: 'Created By', dataIndex: 'createdBy', key: 'by', width: 110, render: (v) => v || '—' },
    { title: 'Actions', key: 'actions', width: 120, align: 'center', fixed: 'right', render: (_, r) => (
      <Space size={4}>
        <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
        {String(r.status) !== 'Reversed' && <Tooltip title="Reverse"><Button type="text" size="small" danger icon={<RollbackOutlined />} onClick={() => reverse(r)} /></Tooltip>}
      </Space>
    ) },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg,#fa8c16,#ffc069)' }}><EditOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Inventory Adjustments</h3>
            <span style={{ color: '#667085' }}>Record stock corrections, damage, losses and physical counts</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-info" icon={<HistoryOutlined />} onClick={() => historyRef.current && historyRef.current.scrollIntoView({ behavior: 'smooth' })}>Adjustment History</Button>
        </Space>
      </div>

      <Card className="al-stat-card" style={{ marginBottom: 20 }}>
        <FormSection title="Adjustment Details" icon={<EditOutlined />}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Adjustment Date</div>
              <DatePicker style={{ width: '100%' }} value={adjDate} onChange={setAdjDate} allowClear={false} />
            </Col>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Reference</div>
              <Input value="Auto-generated on posting (ADJ-…)" readOnly />
            </Col>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Item <Text type="danger">*</Text></div>
              <Select showSearch style={{ width: '100%' }} placeholder="Select item" value={productId || undefined}
                optionFilterProp="label" onChange={onSelectProduct}
                options={products.map((p) => ({ value: p.id, label: `${p.sku || p.id} — ${p.name}` }))} />
            </Col>
            <Col xs={24} md={8} style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Warehouse / Location</div>
              <Select style={{ width: '100%' }} value={warehouseId || undefined} onChange={setWarehouseId}
                options={warehouses.map((w) => ({ value: w.id, label: w.name || `Warehouse #${w.id}` }))} />
            </Col>
            <Col xs={24} md={8} style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Reason <Text type="danger">*</Text></div>
              <Select style={{ width: '100%' }} placeholder="Select reason" value={reason || undefined} onChange={setReason}
                options={REASONS.map((r) => ({ value: r, label: r }))} />
            </Col>
            <Col xs={24} md={8} style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Reason Details</div>
              <Input placeholder="e.g. Damaged during transport" value={reasonDetails} onChange={(e) => setReasonDetails(e.target.value)} />
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Stock Information" icon={<ShoppingOutlined />}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Current Quantity</div>
              <Input readOnly value={ctx ? currentQty : '—'} style={{ background: '#f5f5f5' }} />
            </Col>
            <Col xs={24} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Adjustment Type</div>
              <Radio.Group value={adjType} onChange={(e) => setAdjType(e.target.value)} optionType="button" buttonStyle="solid">
                <Radio.Button value="increase"><PlusOutlined /> Increase</Radio.Button>
                <Radio.Button value="decrease"><MinusOutlined /> Decrease</Radio.Button>
                <Radio.Button value="count">Physical Count</Radio.Button>
              </Radio.Group>
            </Col>
            {adjType === 'count' ? (
              <Col xs={24} md={6}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>Counted Quantity</div>
                <InputNumber min={0} style={{ width: '100%' }} value={countedQty} onChange={setCountedQty} />
              </Col>
            ) : (
              <Col xs={24} md={6}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>Adjustment Quantity</div>
                <InputNumber min={0} style={{ width: '100%' }} value={qty} onChange={setQty} />
              </Col>
            )}
            <Col xs={24} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>New Quantity</div>
              <Input readOnly value={ctx ? newQty : '—'} style={{ background: '#f5f5f5', fontWeight: 700, color: negativeWarning ? '#cf1322' : undefined }} />
            </Col>
          </Row>
          {adjType === 'count' && (
            <div style={{ marginTop: 8, color: '#667085' }}>System: {currentQty} · Counted: {countedQty == null ? '—' : countedQty} · Adjustment: {signedQty > 0 ? `+${signedQty}` : signedQty}</div>
          )}
          {negativeWarning && <Alert type="error" showIcon style={{ marginTop: 12 }} message={`Cannot reduce by ${Math.abs(signedQty)} units without going negative. Only ${currentQty} units are currently available. Negative stock is allowed in AccuLedger, but please confirm.`} />}
          {directionWarning && <Alert type="warning" showIcon style={{ marginTop: 12 }} message={`${reason} stock normally changes inventory the other way. Please confirm this adjustment.`} />}
        </FormSection>

        <FormSection title="Valuation" icon={<BookOutlined />}>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Carrying Cost</div>
              <Input readOnly value={ctx ? money(ctx.unitCost) : '—'} style={{ background: '#f5f5f5' }} />
            </Col>
            <Col xs={12} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Current Inventory Value</div>
              <Input readOnly value={ctx ? money(currentValue) : '—'} style={{ background: '#f5f5f5' }} />
            </Col>
            <Col xs={12} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Value Change</div>
              <Input readOnly value={ctx ? money(valueChange) : '—'} style={{ background: '#f5f5f5', color: valueChange < 0 ? '#cf1322' : '#3f8600' }} />
            </Col>
            <Col xs={12} md={6}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>New Inventory Value</div>
              <Input readOnly value={ctx ? money(newValue) : '—'} style={{ background: '#f5f5f5', fontWeight: 700 }} />
            </Col>
          </Row>
          {needsCostBasis && (
            <Row gutter={16} style={{ marginTop: 12 }}>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>Unit Cost <Text type="danger">*</Text></div>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Cost basis for the new stock" value={unitCostInput} onChange={setUnitCostInput} prefix={cSym} />
                <Text type="secondary" style={{ fontSize: 11 }}>This item has no stock/cost basis — enter the unit cost so the new inventory is not valued at zero.</Text>
              </Col>
            </Row>
          )}
        </FormSection>

        <FormSection title="Notes" icon={<FileTextOutlined />}>
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
        </FormSection>

        <div style={{ textAlign: 'right' }}>
          <Button onClick={resetForm} style={{ marginRight: 8 }}>Cancel</Button>
          <Button type="primary" loading={posting} disabled={!canPost} onClick={confirmPost}>{posting ? 'Posting…' : 'Post Adjustment'}</Button>
        </div>
      </Card>

      <div ref={historyRef}>
        <Card className="al-stat-card" title={<Space><HistoryOutlined /> Recent Adjustments</Space>} bodyStyle={{ padding: 0 }}>
          <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
            <Input placeholder="Search item / reference..." allowClear style={{ width: 220 }} value={hFilters.search}
              onChange={(e) => setHFilters((f) => ({ ...f, search: e.target.value }))} />
            <Select style={{ width: 150 }} value={hFilters.reason} onChange={(v) => setHFilters((f) => ({ ...f, reason: v }))}>
              <Select.Option value="all">All Reasons</Select.Option>
              {REASONS.map((r) => <Select.Option key={r} value={r}>{r}</Select.Option>)}
            </Select>
            <Select style={{ width: 160 }} value={hFilters.warehouseId} onChange={(v) => setHFilters((f) => ({ ...f, warehouseId: v }))}>
              <Select.Option value="all">All Warehouses</Select.Option>
              {warehouses.map((w) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
            <Select style={{ width: 130 }} value={hFilters.direction} onChange={(v) => setHFilters((f) => ({ ...f, direction: v }))}>
              <Select.Option value="all">All</Select.Option>
              <Select.Option value="increase">Increase</Select.Option>
              <Select.Option value="decrease">Decrease</Select.Option>
            </Select>
            <DatePicker.RangePicker value={hFilters.range} onChange={(r) => setHFilters((f) => ({ ...f, range: r }))} />
            <Button onClick={() => setHFilters({ search: '', reason: 'all', warehouseId: 'all', direction: 'all', range: null })}>Clear Filters</Button>
            <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={() => loadHistory(hFilters)} /></Tooltip>
          </div>
          {historyError && <Alert type="error" showIcon style={{ margin: 16 }} message="Unable to load adjustments." description={historyError} action={<Button size="small" onClick={() => loadHistory(hFilters)}>Retry</Button>} />}
          {!historyLoading && !historyError && historyRows.length === 0 ? (
            <div style={{ padding: 40 }}><Empty description="No inventory adjustments recorded yet." /></div>
          ) : (
            <Table rowKey="id" size="middle" loading={historyLoading} dataSource={historyRows} columns={historyColumns} scroll={{ x: 1300 }}
              pagination={{ defaultPageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} adjustments`, style: { margin: 16 } }} />
          )}
        </Card>
      </div>

      <Drawer title={detail ? `Adjustment ${detail.reference || `#${detail.id}`}` : 'Adjustment'} width={640} visible={detailOpen} onClose={() => setDetailOpen(false)} destroyOnClose>
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Reference">{detail.reference || `#${detail.id}`}</Descriptions.Item>
              <Descriptions.Item label="Date">{detail.adjustmentDate ? moment(detail.adjustmentDate).format('DD MMM YYYY') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={String(detail.status) === 'Reversed' ? 'red' : 'green'}>{detail.status || 'Posted'}</Tag></Descriptions.Item>
              <Descriptions.Item label="Item">{detail.productName || '—'}</Descriptions.Item>
              <Descriptions.Item label="SKU">{detail.sku || '—'}</Descriptions.Item>
              <Descriptions.Item label="Warehouse">{detail.warehouseName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Reason">{detail.reason || '—'}</Descriptions.Item>
              <Descriptions.Item label="Reason Details">{detail.reasonDetails || '—'}</Descriptions.Item>
              <Descriptions.Item label="Notes">{detail.notes || '—'}</Descriptions.Item>
              <Descriptions.Item label="Quantity Before">{detail.qtyBefore}</Descriptions.Item>
              <Descriptions.Item label="Adjustment">{detail.quantity}</Descriptions.Item>
              <Descriptions.Item label="Quantity After">{detail.qtyAfter}</Descriptions.Item>
              <Descriptions.Item label="Unit Cost">{money(detail.unitCost)}</Descriptions.Item>
              <Descriptions.Item label="Value Before">{money(detail.valueBefore)}</Descriptions.Item>
              <Descriptions.Item label="Value Change">{money(detail.valueChange)}</Descriptions.Item>
              <Descriptions.Item label="Value After">{money(detail.valueAfter)}</Descriptions.Item>
              <Descriptions.Item label="Created By">{detail.createdBy || '—'}</Descriptions.Item>
              <Descriptions.Item label="Created At">{detail.createdAt ? moment(detail.createdAt).format('DD MMM YYYY HH:mm') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Inventory Movement">{detail.movementId ? `#${detail.movementId}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Journal Entry">{detail.journalId ? `#${detail.journalId}` : '—'}</Descriptions.Item>
              {detail.original && <Descriptions.Item label="Reversal Of">{detail.original.reference || `#${detail.original.id}`}</Descriptions.Item>}
              {detail.reversal && <Descriptions.Item label="Reversed By">{detail.reversal.reference || `#${detail.reversal.id}`}</Descriptions.Item>}
            </Descriptions>
            <Space style={{ marginTop: 16 }} wrap>
              {detail.productId && <Button icon={<ShoppingOutlined />} onClick={() => history.push(`/main/inventory/items?item=${detail.productId}`)}>View Item</Button>}
              <Button icon={<HistoryOutlined />} onClick={() => history.push('/main/inventory/movement-report')}>View Inventory Movement</Button>
              {detail.journalId && <Button icon={<BookOutlined />} onClick={() => history.push('/main/accountant/journal-entries')}>View Journal Entry</Button>}
              {String(detail.status) !== 'Reversed' && <Button danger icon={<RollbackOutlined />} onClick={() => reverse(detail)}>Reverse Adjustment</Button>}
            </Space>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default Adjustments;
