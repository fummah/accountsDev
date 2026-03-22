import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Select, Switch, Input, InputNumber, Tag, Row, Col, message, Divider } from 'antd';

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

  const load = async () => {
    try {
      const list = await window.electronAPI.currencyList?.();
      if (Array.isArray(list)) setCurrencies(list);
      const base = await window.electronAPI.currencyGetBase?.();
      if (base?.code) setBaseCurrency(base.code);
      const r = await window.electronAPI.currencyRates?.('', 200);
      if (Array.isArray(r)) setRates(r);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const changeBase = async (code) => {
    await window.electronAPI.currencySetBase?.(code);
    message.success(`Base currency set to ${code}`);
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

  const doConvert = async () => {
    const res = await window.electronAPI.currencyConvert?.(convertAmt, convertFrom, convertTo);
    if (res?.result !== null && res?.result !== undefined) {
      setConvertResult(res.result);
    } else {
      message.warning('No exchange rate found for this pair. Please add one first.');
      setConvertResult(null);
    }
  };

  const activeCurrencies = currencies.filter(c => c.active);

  const currencyColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 80, render: (v, r) => r.isBase ? <Tag color="gold">{v} (Base)</Tag> : v },
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
    { title: 'Source', dataIndex: 'source', key: 'source', width: 80 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Multi-Currency Settings</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="Base Currency" size="small">
            <p>All reports default to this currency. Foreign transactions are converted at the applicable exchange rate.</p>
            <Select value={baseCurrency} onChange={changeBase} style={{ width: 240 }} showSearch
              filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
              {currencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code} — {c.name}</Select.Option>)}
            </Select>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Quick Converter" size="small">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <InputNumber value={convertAmt} onChange={setConvertAmt} min={0} style={{ width: 100 }} />
              <Select value={convertFrom} onChange={setConvertFrom} style={{ width: 100 }}>
                {activeCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code}</Select.Option>)}
              </Select>
              <span style={{ fontWeight: 600 }}>→</span>
              <Select value={convertTo} onChange={setConvertTo} style={{ width: 100 }}>
                {activeCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code}</Select.Option>)}
              </Select>
              <Button type="primary" size="small" onClick={doConvert}>Convert</Button>
              {convertResult !== null && <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px' }}>{convertResult.toFixed(2)} {convertTo}</Tag>}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="Currencies" size="small" extra={<Tag>{currencies.length} total / {activeCurrencies.length} active</Tag>}>
            <Table dataSource={currencies} columns={currencyColumns} rowKey="code" size="small" pagination={{ pageSize: 12 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Add Custom Currency" size="small" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Input placeholder="Code (e.g. BTC)" value={newCode} onChange={e => setNewCode(e.target.value)} />
              <Input placeholder="Name (e.g. Bitcoin)" value={newName} onChange={e => setNewName(e.target.value)} />
              <Input placeholder="Symbol (e.g. ₿)" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} />
              <Button type="primary" onClick={addCurrency}>Add Currency</Button>
            </div>
          </Card>
          <Card title="Set Exchange Rate" size="small">
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

      <Card title="Exchange Rate History" size="small" extra={<Button size="small" onClick={load}>Refresh</Button>}>
        <Table dataSource={rates} columns={rateColumns} rowKey="id" size="small" pagination={{ pageSize: 15 }} />
      </Card>
    </div>
  );
};

export default CurrencySettings;
