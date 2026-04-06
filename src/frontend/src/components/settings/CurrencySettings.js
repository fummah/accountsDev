import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Button, Select, Switch, Input, InputNumber, Tag, Row, Col, message, Divider, Statistic, Tabs, Space, Spin, Alert } from 'antd';
import { SwapOutlined, ReloadOutlined, GlobalOutlined, PlusOutlined, DollarOutlined } from '@ant-design/icons';
import { refreshBaseCurrency } from '../../utils/currency';

const { TabPane } = Tabs;

const LIVE_API_URL = 'https://api.frankfurter.app';

const CurrencySettings = () => {
  const [currencies, setCurrencies] = useState([]);
  const [rates, setRates] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [rateFrom, setRateFrom] = useState('USD');
  const [rateTo, setRateTo] = useState('');
  const [rateValue, setRateValue] = useState(1);
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [convertAmt, setConvertAmt] = useState(100);
  const [convertFrom, setConvertFrom] = useState('USD');
  const [convertTo, setConvertTo] = useState('EUR');
  const [convertResult, setConvertResult] = useState(null);
  const [liveRate, setLiveRate] = useState(null);
  const [converting, setConverting] = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await window.electronAPI.currencyList?.();
      if (Array.isArray(list)) setCurrencies(list);
      const base = await window.electronAPI.currencyGetBase?.();
      if (base?.code) setBaseCurrency(base.code);
      const r = await window.electronAPI.currencyRates?.('', 200);
      if (Array.isArray(r)) setRates(r);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeBase = async (code) => {
    await window.electronAPI.currencySetBase?.(code);
    await refreshBaseCurrency();
    message.success(`Base currency set to ${code}. All financial figures will now use the new currency.`);
    load();
  };

  const toggleCurrency = async (code, active) => {
    await window.electronAPI.currencyToggle?.(code, active);
    load();
  };

  const addCurrency = async () => {
    if (!newCode || !newName) { message.warning('Code and name required'); return; }
    await window.electronAPI.currencyAdd?.(newCode.toUpperCase(), newName, newSymbol || newCode, 2);
    message.success(`Currency ${newCode.toUpperCase()} added`);
    setNewCode(''); setNewName(''); setNewSymbol('');
    load();
  };

  const addRate = async () => {
    if (!rateFrom || !rateTo || !rateValue) { message.warning('All fields required'); return; }
    await window.electronAPI.currencySetRate?.(rateFrom, rateTo, rateValue, rateDate);
    message.success(`Rate ${rateFrom}/${rateTo} = ${rateValue} set`);
    load();
  };

  const doConvertOnline = async () => {
    if (convertFrom === convertTo) {
      setConvertResult(convertAmt);
      setLiveRate(1);
      return;
    }
    setConverting(true);
    setConvertResult(null);
    setLiveRate(null);
    try {
      const resp = await fetch(`${LIVE_API_URL}/latest?amount=${convertAmt}&from=${convertFrom}&to=${convertTo}`);
      if (resp.ok) {
        const json = await resp.json();
        const result = json.rates?.[convertTo];
        if (result !== undefined) {
          setConvertResult(result);
          setLiveRate(json.rates?.[convertTo] / convertAmt);
          return;
        }
      }
      // Fallback: try local DB
      const res = await window.electronAPI.currencyConvert?.(convertAmt, convertFrom, convertTo);
      if (res?.result !== null && res?.result !== undefined) {
        setConvertResult(res.result);
        setLiveRate(null);
      } else {
        message.warning('Could not fetch live rate. Try adding a manual rate or check currency codes.');
      }
    } catch (_) {
      // Fallback to local
      try {
        const res = await window.electronAPI.currencyConvert?.(convertAmt, convertFrom, convertTo);
        if (res?.result !== null && res?.result !== undefined) {
          setConvertResult(res.result);
        } else {
          message.warning('No rate available. Offline and no local rate found.');
        }
      } catch { message.error('Conversion failed'); }
    } finally {
      setConverting(false);
    }
  };

  const fetchLiveRates = async () => {
    setFetchingLive(true);
    try {
      const resp = await fetch(`${LIVE_API_URL}/latest?from=${baseCurrency}`);
      if (resp.ok) {
        const json = await resp.json();
        const today = new Date().toISOString().slice(0, 10);
        let count = 0;
        for (const [code, rate] of Object.entries(json.rates || {})) {
          await window.electronAPI.currencySetRate?.(baseCurrency, code, rate, today);
          count++;
        }
        message.success(`Fetched ${count} live rates from ${baseCurrency}`);
        load();
      } else {
        message.error('Failed to fetch live rates');
      }
    } catch (_) {
      message.error('Network error. Could not fetch live rates.');
    } finally {
      setFetchingLive(false);
    }
  };

  const activeCurrencies = currencies.filter(c => c.active);

  const currencyColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, render: (v, r) => r.isBase ? <Tag color="gold">{v} (Base)</Tag> : <strong>{v}</strong> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 70 },
    { title: 'Decimals', dataIndex: 'decimals', key: 'decimals', width: 80 },
    { title: 'Active', key: 'active', width: 80, render: (_, r) => <Switch size="small" checked={!!r.active} onChange={v => toggleCurrency(r.code, v)} /> },
  ];

  const rateColumns = [
    { title: 'From', dataIndex: 'fromCurrency', key: 'from', width: 70 },
    { title: 'To', dataIndex: 'toCurrency', key: 'to', width: 70 },
    { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 120, render: v => Number(v).toFixed(6) },
    { title: 'Date', dataIndex: 'effectiveDate', key: 'date', width: 120 },
    { title: 'Source', dataIndex: 'source', key: 'source', width: 80, render: v => v ? <Tag>{v}</Tag> : '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 8 }} />Multi-Currency Settings</span>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button><Button type="primary" icon={<GlobalOutlined />} loading={fetchingLive} onClick={fetchLiveRates}>Fetch Live Rates</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Base Currency" value={baseCurrency} prefix={<DollarOutlined />} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Currencies" value={currencies.length} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Active" value={activeCurrencies.length} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Exchange Rates" value={rates.length} /></Card></Col>
        </Row>

        <Card size="small" title={<span><SwapOutlined style={{ marginRight: 6 }} />Quick Currency Converter (Live)</span>} style={{ marginBottom: 20, background: '#fafafa' }}>
          <Alert message="Uses frankfurter.app free API for live exchange rates. Falls back to local rates when offline." type="info" showIcon style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <InputNumber value={convertAmt} onChange={setConvertAmt} min={0} style={{ width: 120 }} size="large" />
            <Select value={convertFrom} onChange={v => { setConvertFrom(v); setConvertResult(null); }} style={{ width: 120 }} size="large" showSearch>
              {activeCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.symbol || c.code} {c.code}</Select.Option>)}
            </Select>
            <SwapOutlined style={{ fontSize: 20, color: '#1890ff', cursor: 'pointer' }} onClick={() => { const t = convertFrom; setConvertFrom(convertTo); setConvertTo(t); setConvertResult(null); }} />
            <Select value={convertTo} onChange={v => { setConvertTo(v); setConvertResult(null); }} style={{ width: 120 }} size="large" showSearch>
              {activeCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.symbol || c.code} {c.code}</Select.Option>)}
            </Select>
            <Button type="primary" size="large" onClick={doConvertOnline} loading={converting} icon={<SwapOutlined />}>Convert</Button>
          </div>
          {convertResult !== null && (
            <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1890ff' }}>
                {Number(convertResult).toFixed(2)} {convertTo}
              </div>
              <div style={{ color: '#888', fontSize: 13 }}>
                {convertAmt} {convertFrom} = {Number(convertResult).toFixed(4)} {convertTo}
                {liveRate && <span> &nbsp;(Rate: {liveRate.toFixed(6)} — Live)</span>}
              </div>
            </div>
          )}
        </Card>

        <Tabs defaultActiveKey="1">
          <TabPane tab="Base Currency & Currencies" key="1">
            <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={16}>
                <Card size="small" title="Manage Currencies" extra={<Tag>{currencies.length} total / {activeCurrencies.length} active</Tag>}>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Base Currency:</strong>&nbsp;
                    <Select value={baseCurrency} onChange={changeBase} style={{ width: 280 }} showSearch
                      filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
                      {currencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code} — {c.name}</Select.Option>)}
                    </Select>
                    <span style={{ marginLeft: 8, color: '#888' }}>All amounts across the app default to this currency.</span>
                  </div>
                  <Table dataSource={currencies} columns={currencyColumns} rowKey="code" size="small" pagination={{ pageSize: 12 }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title="Add Custom Currency" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Input placeholder="Code (e.g. BTC)" value={newCode} onChange={e => setNewCode(e.target.value)} />
                    <Input placeholder="Name (e.g. Bitcoin)" value={newName} onChange={e => setNewName(e.target.value)} />
                    <Input placeholder="Symbol (e.g. ₿)" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={addCurrency}>Add Currency</Button>
                  </div>
                </Card>
              </Col>
            </Row>
          </TabPane>

          <TabPane tab="Exchange Rates" key="2">
            <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={16}>
                <Card size="small" title="Rate History" extra={<Space><Button size="small" onClick={load} icon={<ReloadOutlined />}>Refresh</Button><Button size="small" type="primary" loading={fetchingLive} onClick={fetchLiveRates} icon={<GlobalOutlined />}>Fetch Live</Button></Space>}>
                  <Table dataSource={rates} columns={rateColumns} rowKey="id" size="small" pagination={{ pageSize: 15 }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title="Set Manual Rate">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Select value={rateFrom} onChange={setRateFrom} style={{ flex: 1 }}>
                        {activeCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code}</Select.Option>)}
                      </Select>
                      <span style={{ lineHeight: '32px' }}>→</span>
                      <Select value={rateTo} onChange={setRateTo} style={{ flex: 1 }} placeholder="To">
                        {activeCurrencies.filter(c => c.code !== rateFrom).map(c => <Select.Option key={c.code} value={c.code}>{c.code}</Select.Option>)}
                      </Select>
                    </div>
                    <InputNumber value={rateValue} onChange={setRateValue} min={0} step={0.0001} style={{ width: '100%' }} placeholder="Rate" />
                    <Input type="date" value={rateDate} onChange={e => setRateDate(e.target.value)} />
                    <Button type="primary" onClick={addRate}>Set Rate</Button>
                  </div>
                </Card>
              </Col>
            </Row>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default CurrencySettings;
