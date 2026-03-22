import React, { useEffect, useMemo, useState } from 'react';
import { Card, Select, Checkbox, DatePicker, Button, Space, Table, Typography, Input, message, Popconfirm } from 'antd';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const entityOptions = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'transactions', label: 'Transactions' },
];

const ReportBuilder = () => {
  const [meta, setMeta] = useState({});
  const [entity, setEntity] = useState('invoices');
  const [fields, setFields] = useState([]);
  const [dateField, setDateField] = useState('start_date');
  const [range, setRange] = useState([]);
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  const fieldOptions = useMemo(() => (meta[entity] || []).map(f => ({ value: f, label: f })), [meta, entity]);

  const reloadTemplates = async () => {
    try { const t = await window.electronAPI.reportTemplatesList?.(); setTemplates(Array.isArray(t)?t:[]);} catch {}
  };

  useEffect(() => {
    (async () => {
      try {
        const m = await window.electronAPI.reportBuilderMetadata?.();
        if (m && typeof m === 'object') setMeta(m);
        await reloadTemplates();
      } catch (e) {
        message.warning('Report metadata unavailable');
      }
    })();
  }, []);

  useEffect(() => {
    setFields(meta[entity] || []);
    const df = (meta[entity] || []).find(f => /date/i.test(f)) || (entity === 'expenses' ? 'payment_date' : 'date');
    setDateField(df);
    setFilters({});
    setRows([]);
    setActiveTemplateId(null);
    setTemplateName('');
  }, [entity, meta]);

  const run = async () => {
    try {
      setLoading(true);
      const [start, end] = range || [];
      const effectiveFilters = Object.fromEntries(Object.entries(filters || {}).filter(([_, v]) => String(v ?? '') !== ''));
      const selectedFields = (fields && fields.length) ? fields : (meta[entity] || []);
      if (!window.electronAPI.reportBuilderRun) {
        message.error('Backend not ready: reportBuilderRun missing');
        return;
      }
      const res = await window.electronAPI.reportBuilderRun({
        entity,
        fields: selectedFields,
        dateField,
        startDate: start ? start.format('YYYY-MM-DD') : undefined,
        endDate: end ? end.format('YYYY-MM-DD') : undefined,
        filters: effectiveFilters
      });
      if (res && res.error) {
        message.error(res.error);
        setRows([]);
      } else {
        setRows(Array.isArray(res) ? res : []);
      }
    } catch (e) {
      message.error(e?.message || 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const cols = (fields.length ? fields : meta[entity] || []).map(f => ({ title: f, dataIndex: f, key: f }));

  const exportCsv = () => {
    const headers = cols.map(c => c.title).join(',');
    const data = rows.map(r => cols.map(c => JSON.stringify(r[c.dataIndex] ?? '')).join(',')).join('\n');
    const blob = new Blob([headers + '\n' + data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${entity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const data = rows.map(r => Object.fromEntries(cols.map(c => [c.title, r[c.dataIndex]])));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report-${entity}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const header = cols.map(c => c.title).join(' | ');
    doc.setFontSize(12);
    doc.text(`Report: ${entity}`, 10, 10);
    doc.setFontSize(8);
    doc.text(header, 10, 16);
    let y = 22;
    const lineHeight = 5;
    rows.forEach(r => {
      const line = cols.map(c => String(r[c.dataIndex] ?? '')).join(' | ');
      const wrapped = doc.splitTextToSize(line, pageWidth - 20);
      wrapped.forEach(seg => { doc.text(seg, 10, y); y += lineHeight; });
      if (y > doc.internal.pageSize.getHeight() - 10) { doc.addPage(); y = 10; }
    });
    doc.save(`report-${entity}.pdf`);
  };

  const exportXml = () => {
    const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const rowsXml = rows.map(r => `  <row>\n${cols.map(c => `    <${c.title}>${esc(r[c.dataIndex])}</${c.title}>`).join('\n')}\n  </row>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<report entity="${entity}">\n${rowsXml}\n</report>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${entity}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Field reorder helpers
  const moveField = (idx, dir) => {
    const nf = [...fields];
    const j = idx + dir;
    if (j < 0 || j >= nf.length) return;
    const tmp = nf[idx]; nf[idx] = nf[j]; nf[j] = tmp;
    setFields(nf);
  };

  // Templates actions
  const saveTemplate = async () => {
    try {
      const payload = { id: activeTemplateId || undefined, name: templateName || 'Untitled', entity, fields, filters, dateField };
      const res = await window.electronAPI.reportTemplateSave?.(payload);
      if (res && res.error) throw new Error(res.error);
      message.success('Template saved');
      setActiveTemplateId(res?.id || activeTemplateId);
      await reloadTemplates();
    } catch (e) { message.error(e?.message || 'Failed to save template'); }
  };

  const loadTemplate = async (id) => {
    try {
      const t = await window.electronAPI.reportTemplateGet?.(id);
      if (!t || t.error) throw new Error(t?.error || 'Not found');
      setActiveTemplateId(t.id);
      setTemplateName(t.name);
      setEntity(t.entity);
      try { setFields(JSON.parse(t.fields || '[]')); } catch { setFields([]); }
      try { setFilters(JSON.parse(t.filters || '{}')); } catch { setFilters({}); }
      setDateField(t.dateField || dateField);
    } catch (e) { message.error(e?.message || 'Failed to load template'); }
  };

  const deleteTemplate = async (id) => {
    try {
      const res = await window.electronAPI.reportTemplateDelete?.(id);
      if (res && res.error) throw new Error(res.error);
      if (activeTemplateId === id) { setActiveTemplateId(null); setTemplateName(''); }
      await reloadTemplates();
      message.success('Template deleted');
    } catch (e) { message.error(e?.message || 'Failed to delete template'); }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>Custom Report Builder</Title>

        <Space wrap style={{ alignItems:'flex-start' }}>
          <div>
            <div style={{ marginBottom: 4 }}>Entity</div>
            <Select value={entity} onChange={setEntity} options={entityOptions} style={{ width: 200 }} />
          </div>

          <div>
            <div style={{ marginBottom: 4 }}>Fields</div>
            <Select
              mode="multiple"
              value={fields}
              onChange={setFields}
              options={fieldOptions}
              placeholder="Select fields"
              style={{ minWidth: 300 }}
            />
            {!!fields.length && (
              <div style={{ marginTop: 6, maxWidth: 420 }}>
                {fields.map((f, i) => (
                  <div key={f} style={{ display:'flex', alignItems:'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ flex: 1, background:'#fafafa', padding:'2px 6px', border:'1px solid #eee' }}>{f}</div>
                    <Button size="small" onClick={() => moveField(i, -1)} disabled={i===0}>↑</Button>
                    <Button size="small" onClick={() => moveField(i, 1)} disabled={i===fields.length-1}>↓</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ marginBottom: 4 }}>Date Field</div>
            <Select value={dateField} onChange={setDateField} options={fieldOptions} style={{ width: 200 }} />
          </div>

          <div>
            <div style={{ marginBottom: 4 }}>Date Range</div>
            <RangePicker value={range} onChange={setRange} />
          </div>

          <div style={{ alignSelf:'end' }}>
            <Button type="primary" onClick={run} loading={loading} style={{ marginRight: 8 }}>Run</Button>
            <Button onClick={exportCsv} disabled={!rows.length} style={{ marginRight: 6 }}>CSV</Button>
            <Button onClick={exportExcel} disabled={!rows.length} style={{ marginRight: 6 }}>Excel</Button>
            <Button onClick={exportPdf} disabled={!rows.length} style={{ marginRight: 6 }}>PDF</Button>
            <Button onClick={exportXml} disabled={!rows.length}>XML</Button>
          </div>
        </Space>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">Filters (key=value):</Text>
          <Space wrap>
            {(meta[entity] || []).map(f => (
              <Space key={f}>
                <Text>{f}</Text>
                <Input
                  value={filters[f] ?? ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, [f]: e.target.value }))}
                  placeholder=""
                  style={{ width: 160 }}
                />
              </Space>
            ))}
          </Space>
        </Space>

        <Card size="small" title="Templates">
          <Space wrap>
            <Select placeholder="Load template" value={activeTemplateId || undefined} onChange={loadTemplate} style={{ width: 220 }}
              options={templates.map(t => ({ value: t.id, label: `${t.name} (${t.entity})` }))}
            />
            <Input placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ width: 220 }} />
            <Button onClick={saveTemplate} type="primary">Save Template</Button>
            {activeTemplateId && (
              <Popconfirm title="Delete template?" onConfirm={() => deleteTemplate(activeTemplateId)}>
                <Button danger>Delete</Button>
              </Popconfirm>
            )}
          </Space>
        </Card>

        <Table rowKey={(r, i) => i} columns={cols} dataSource={rows} loading={loading} size="small" />
      </Space>
    </Card>
  );
};

export default ReportBuilder;


