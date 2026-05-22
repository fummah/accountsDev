import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, message, Tag, Space, Row, Col, Progress, Tabs, Switch, Upload } from 'antd';
import { GlobalOutlined, UploadOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

const LocalisationSettings = () => {
  const [locales, setLocales] = useState([]);
  const [translations, setTranslations] = useState({});
  const [selectedLocale, setSelectedLocale] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [coverage, setCoverage] = useState({});
  const [activeLocale, setActiveLocale] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedLocale) loadTranslations(selectedLocale); }, [selectedLocale]);

  const loadData = async () => {
    setLoading(true);
    try {
      const l = await window.electronAPI.i18nLocales?.() || [];
      setLocales(Array.isArray(l) ? l : []);
      // Get current setting
      const current = await window.electronAPI.settingsGet?.('locale');
      if (current) setActiveLocale(current);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const loadTranslations = async (locale) => {
    try {
      const t = await window.electronAPI.i18nTranslations?.(locale, 'common') || {};
      setTranslations(t);
      const c = await window.electronAPI.i18nCoverage?.(locale) || {};
      setCoverage(c);
    } catch {}
  };

  const handleToggle = async (code, active) => {
    await window.electronAPI.i18nLocaleToggle?.(code, active);
    loadData();
  };

  const handleSetActive = async (code) => {
    await window.electronAPI.settingsSet?.('locale', code);
    setActiveLocale(code);
    // Also set date format from locale
    const locale = locales.find(l => l.code === code);
    if (locale?.date_format) {
      await window.electronAPI.settingsSet?.('date_format', locale.date_format);
    }
    message.success(`Locale set to ${code}`);
  };

  const handleSaveTranslation = async () => {
    if (!editKey || !editValue) return;
    await window.electronAPI.i18nTranslationSet?.(selectedLocale, 'common', editKey, editValue);
    message.success('Translation saved');
    setEditVisible(false);
    loadTranslations(selectedLocale);
  };

  const handleExport = async () => {
    const data = await window.electronAPI.i18nExport?.(selectedLocale) || [];
    const csv = ['namespace,key,value', ...data.map(r => `${r.namespace},"${r.key}","${(r.value || '').replace(/"/g, '""')}"`)]
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `translations-${selectedLocale}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    const lines = importText.split(/\r?\n/).filter(Boolean);
    const header = lines.shift();
    const entries = lines.map(line => {
      const parts = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g) || [];
      const clean = parts.map(p => p.replace(/^,?"?|"?$/g, '').replace(/""/g, '"'));
      return { namespace: clean[0] || 'common', key: clean[1], value: clean[2] };
    }).filter(e => e.key && e.value);
    const result = await window.electronAPI.i18nImport?.(selectedLocale, entries);
    message.success(`Imported ${result?.count || 0} translations`);
    setImportVisible(false);
    setImportText('');
    loadTranslations(selectedLocale);
  };

  const transData = Object.entries(translations).map(([key, value]) => ({ key, value }));

  const localeColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 80, render: (v, r) => <Tag color={v === activeLocale ? 'green' : 'default'}>{v}</Tag> },
    { title: 'Language', dataIndex: 'name', key: 'name' },
    { title: 'Native', dataIndex: 'native_name', key: 'native_name' },
    { title: 'Direction', dataIndex: 'direction', key: 'direction', width: 80, render: v => v === 'rtl' ? <Tag color="orange">RTL</Tag> : <Tag>LTR</Tag> },
    { title: 'Date Format', dataIndex: 'date_format', key: 'date_format' },
    { title: 'Active', key: 'active', width: 80, render: (_, r) => <Switch size="small" checked={r.active === 1} onChange={v => handleToggle(r.code, v)} /> },
    { title: '', key: 'actions', width: 120, render: (_, r) => (
      <Space>
        <Button size="small" onClick={() => setSelectedLocale(r.code)}>Translations</Button>
        {r.code !== activeLocale && <Button size="small" type="primary" onClick={() => handleSetActive(r.code)}>Set Active</Button>}
      </Space>
    )},
  ];

  const transColumns = [
    { title: 'Key', dataIndex: 'key', key: 'key', ellipsis: true },
    { title: 'Value', dataIndex: 'value', key: 'value', ellipsis: true },
    { title: '', key: 'edit', width: 80, render: (_, r) => (
      <Button size="small" onClick={() => { setEditKey(r.key); setEditValue(r.value); setEditVisible(true); }}>Edit</Button>
    )},
  ];

  return (
    <Card title={<><GlobalOutlined /> Multi-Language & Localisation</>}>
      <Tabs defaultActiveKey="1">
        <TabPane tab="Locales" key="1">
          <Table columns={localeColumns} dataSource={locales} rowKey="code" loading={loading} size="small" pagination={{ pageSize: 15 }} />
        </TabPane>
        <TabPane tab={`Translations (${selectedLocale})`} key="2">
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Select value={selectedLocale} onChange={v => setSelectedLocale(v)} style={{ width: '100%' }}>
                {locales.map(l => <Option key={l.code} value={l.code}>{l.code} — {l.name}</Option>)}
              </Select>
            </Col>
            <Col span={6}>
              <Progress percent={coverage.percentage || 0} size="small" status={coverage.percentage >= 100 ? 'success' : 'active'} />
              <span style={{ fontSize: 12, color: '#888' }}>{coverage.translated || 0} / {coverage.total || 0} keys</span>
            </Col>
            <Col span={12} style={{ textAlign: 'right' }}>
              <Space>
                <Button icon={<PlusOutlined />} onClick={() => { setEditKey(''); setEditValue(''); setEditVisible(true); }}>Add</Button>
                <Button icon={<DownloadOutlined />} onClick={handleExport}>Export CSV</Button>
                <Button icon={<UploadOutlined />} onClick={() => setImportVisible(true)}>Import CSV</Button>
              </Space>
            </Col>
          </Row>
          <Table columns={transColumns} dataSource={transData} rowKey="key" size="small" pagination={{ pageSize: 20 }} />
        </TabPane>
      </Tabs>

      <Modal title="Edit Translation" visible={editVisible} onOk={handleSaveTranslation} onCancel={() => setEditVisible(false)}>
        <Form layout="vertical">
          <Form.Item label="Key"><Input value={editKey} onChange={e => setEditKey(e.target.value)} placeholder="e.g. nav.dashboard" /></Form.Item>
          <Form.Item label={`Value (${selectedLocale})`}><Input value={editValue} onChange={e => setEditValue(e.target.value)} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Import Translations" visible={importVisible} onOk={handleImport} onCancel={() => setImportVisible(false)} width={600}>
        <p>Paste CSV content with columns: <code>namespace, key, value</code></p>
        <TextArea rows={10} value={importText} onChange={e => setImportText(e.target.value)} placeholder="namespace,key,value&#10;common,nav.dashboard,Tableau de bord" />
      </Modal>
    </Card>
  );
};

export default LocalisationSettings;
