import React, { useEffect, useState, useCallback } from 'react';
import { Card, Switch, Space, message, InputNumber, Button, Select, Spin, Row, Col, Statistic, Progress, Divider } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, FileTextOutlined, BankOutlined, AlertOutlined } from '@ant-design/icons';

/* Simple CSS bar chart component */
const MiniBarChart = ({ data, labelKey, valueKey, color = '#1890ff', height = 120 }) => {
  if (!data || !data.length) return <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>No data</div>;
  const max = Math.max(...data.map(d => Math.abs(Number(d[valueKey]) || 0)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, padding: '0 4px' }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const barH = Math.max(2, (Math.abs(val) / max) * (height - 20));
        const barColor = val < 0 ? '#ff4d4f' : color;
        return (
          <div key={i} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: 32, height: barH, background: barColor, borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }} title={`${d[labelKey]}: ${val.toFixed(2)}`} />
            <div style={{ fontSize: 9, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 40 }}>{d[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
};

const AgingBar = ({ data }) => {
  if (!data) return <span>...</span>;
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'];
  const colors = ['#52c41a', '#1890ff', '#faad14', '#fa8c16', '#ff4d4f'];
  const total = Number(data.total) || 1;
  return (
    <div>
      {buckets.map((b, i) => {
        const val = Number(data[b]) || 0;
        const pct = Math.round((val / total) * 100) || 0;
        return (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 50, fontSize: 12 }}>{b}</span>
            <Progress percent={pct} size="small" strokeColor={colors[i]} format={() => `$${val.toFixed(0)}`} style={{ flex: 1 }} />
          </div>
        );
      })}
      <div style={{ fontWeight: 600, marginTop: 4 }}>Total: ${total.toFixed(2)}</div>
    </div>
  );
};

const AnalyticsDashboard = () => {
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState('');

  const [forecast, setForecast] = useState(null);
  const [trend, setTrend] = useState([]);
  const [ar, setAr] = useState(null);
  const [ap, setAp] = useState(null);
  const [insights, setInsights] = useState([]);
  const [widgets, setWidgets] = useState({ kpis:true, cashflow:true, revenue:true, aging:true, insights:true });
  const [saving, setSaving] = useState(false);

  // Predictive
  const [anoms, setAnoms] = useState([]);
  const [whatIfR, setWhatIfR] = useState(5);
  const [whatIfE, setWhatIfE] = useState(2);
  const [whatIf, setWhatIf] = useState([]);
  const [aiTarget, setAiTarget] = useState('revenue');
  const [aiEpochs, setAiEpochs] = useState(50);
  const [aiTraining, setAiTraining] = useState(false);
  const [aiPrediction, setAiPrediction] = useState([]);

  const [pageLoading, setPageLoading] = useState(true);

  const saveWidgets = async () => {
    try { setSaving(true); await window.electronAPI.dashboardWidgetsSet?.({ widgets }); message.success('Layout saved'); } catch {} finally { setSaving(false); }
  };

  const runWhatIf = useCallback(async () => {
    try { const r = await window.electronAPI.whatIfForecast?.({ revenueGrowthPct: whatIfR, expenseGrowthPct: whatIfE }); setWhatIf(Array.isArray(r?.forecast)?r.forecast:[]); } catch {}
  }, [whatIfR, whatIfE]);

  useEffect(() => {
    let cancelled = false;
    const safe = (fn) => fn().catch(() => null);
    const loadAll = async () => {
      setPageLoading(true);
      setError('');
      const d = new Date().toISOString().slice(0,10);
      try {
        // Load ALL data in parallel for speed
        const [layout, kpiRes, forecastRes, trendRes, arRes, apRes, insightsRes, anomRes, whatIfRes] = await Promise.all([
          safe(() => window.electronAPI.dashboardWidgetsGet?.({})),
          safe(() => window.electronAPI.getDashboardKpis?.()),
          safe(() => window.electronAPI.forecastCashflow?.()),
          safe(() => window.electronAPI.getRevenueTrend?.()),
          safe(() => window.electronAPI.getARAging?.(d)),
          safe(() => window.electronAPI.getAPAging?.(d)),
          safe(() => window.electronAPI.dashboardInsights?.()),
          safe(() => window.electronAPI.detectExpenseAnomalies?.()),
          safe(() => window.electronAPI.whatIfForecast?.({ revenueGrowthPct: whatIfR, expenseGrowthPct: whatIfE })),
        ]);
        if (cancelled) return;
        if (layout && !layout.error) setWidgets(prev => ({ ...prev, ...layout }));
        if (kpiRes?.success !== false) setKpis(kpiRes); else setError(kpiRes?.error || '');
        if (forecastRes?.success !== false) setForecast(forecastRes);
        if (Array.isArray(trendRes)) setTrend(trendRes);
        setAr(arRes?.summary || null);
        setAp(apRes?.summary || null);
        setInsights(Array.isArray(insightsRes?.insights) ? insightsRes.insights : []);
        setAnoms(Array.isArray(anomRes?.anomalies) ? anomRes.anomalies : []);
        setWhatIf(Array.isArray(whatIfRes?.forecast) ? whatIfRes.forecast : []);
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  const trainAI = async () => {
    try {
      setAiTraining(true);
      const res = await window.electronAPI.aiTrainSeries?.({ target: aiTarget, epochs: aiEpochs });
      if (res?.success) {
        message.success(`Trained ${aiTarget} model (${res.backend})`);
        await predictAI();
      } else {
        message.error(res?.error || 'Training failed');
      }
    } finally { setAiTraining(false); }
  };

  const predictAI = async () => {
    try {
      const r = await window.electronAPI.aiPredictSeries?.({ target: aiTarget, months: 6 });
      setAiPrediction(Array.isArray(r?.values)?r.values:[]);
    } catch {}
  };
  useEffect(() => { predictAI(); }, [aiTarget]);

  const k = kpis?.kpis || {};
  const cashNet = Number(k.cashNet || 0);

  return (
    <Spin spinning={pageLoading} tip="Loading analytics...">
    <div style={{ padding: 24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
        <Space>
          <span>KPIs</span><Switch size="small" checked={widgets.kpis} onChange={v => setWidgets(prev => ({...prev, kpis:v}))} />
          <span>Cashflow</span><Switch size="small" checked={widgets.cashflow} onChange={v => setWidgets(prev => ({...prev, cashflow:v}))} />
          <span>Revenue</span><Switch size="small" checked={widgets.revenue} onChange={v => setWidgets(prev => ({...prev, revenue:v}))} />
          <span>Aging</span><Switch size="small" checked={widgets.aging} onChange={v => setWidgets(prev => ({...prev, aging:v}))} />
          <span>Insights</span><Switch size="small" checked={widgets.insights} onChange={v => setWidgets(prev => ({...prev, insights:v}))} />
          <Button size="small" loading={saving} onClick={saveWidgets}>Save Layout</Button>
        </Space>
      </div>

      {error ? <div style={{ color: 'red', marginBottom: 12 }}>{error}</div> : null}

      {widgets.kpis && kpis && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="Total Credits" value={Number(k.totalCredits || 0)} precision={2} prefix={<DollarOutlined />} valueStyle={{ color: '#3f8600' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Total Debits" value={Number(k.totalDebits || 0)} precision={2} prefix={<DollarOutlined />} valueStyle={{ color: '#cf1322' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Cash Net" value={cashNet} precision={2} prefix={cashNet >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} valueStyle={{ color: cashNet >= 0 ? '#3f8600' : '#cf1322' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Outstanding Invoices" value={Number(k.outstandingInvoicesAmount || 0)} precision={2} prefix={<FileTextOutlined />} suffix={<span style={{ fontSize: 12 }}>({k.outstandingInvoicesCount || 0})</span>} />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {widgets.revenue && (
          <Col span={12}>
            <Card size="small" title="Revenue Trend (last 12 months)">
              <MiniBarChart data={trend} labelKey="ym" valueKey="revenue" color="#1890ff" height={140} />
            </Card>
          </Col>
        )}
        {widgets.cashflow && forecast && (
          <Col span={12}>
            <Card size="small" title="Cashflow Forecast (next 6 months)">
              <MiniBarChart data={forecast.forecast || []} labelKey="ym" valueKey="net" color="#52c41a" height={140} />
            </Card>
          </Col>
        )}
      </Row>

      {widgets.aging && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Card size="small" title={<span><BankOutlined /> A/R Aging</span>}><AgingBar data={ar} /></Card>
          </Col>
          <Col span={12}>
            <Card size="small" title={<span><BankOutlined /> A/P Aging</span>}><AgingBar data={ap} /></Card>
          </Col>
        </Row>
      )}

      {widgets.insights && (
        <Card size="small" title={<span><AlertOutlined /> Insights</span>} style={{ marginBottom: 16 }}>
          {insights && insights.length ? (
            <ul style={{ margin:0, paddingLeft:18 }}>
              {insights.map((ins, idx) => (
                <li key={idx} style={{ color: ins.severity==='warning' ? '#fa541c' : undefined, marginBottom: 4 }}>{ins.message}</li>
              ))}
            </ul>
          ) : 'No insights available.'}
        </Card>
      )}

      <Divider orientation="left">Advanced Analytics</Divider>

      <Row gutter={16}>
        <Col span={8}>
          <Card size="small" title="Expense Anomalies">
            {anoms && anoms.length ? (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {anoms.slice(0, 20).map((a, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                    <span>{a.ym} {a.category}</span>
                    <span style={{ color: '#cf1322', fontWeight: 500 }}>${Number(a.amount).toFixed(2)} (z={a.z})</span>
                  </div>
                ))}
              </div>
            ) : 'No anomalies flagged.'}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="What-if Forecast (6 months)">
            <div style={{ marginBottom: 8, fontSize: 12 }}>
              Rev %: <InputNumber size="small" min={-50} max={100} value={whatIfR} onChange={v => setWhatIfR(Number(v)||0)} style={{ width: 60 }} />
              &nbsp;Exp %: <InputNumber size="small" min={-50} max={100} value={whatIfE} onChange={v => setWhatIfE(Number(v)||0)} style={{ width: 60 }} />
              &nbsp;<Button size="small" onClick={runWhatIf}>Run</Button>
            </div>
            <MiniBarChart data={whatIf} labelKey="ym" valueKey="profit" color="#722ed1" height={100} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="AI Forecast (TensorFlow.js)">
            <div style={{ marginBottom: 8, fontSize: 12 }}>
              <Select size="small" value={aiTarget} onChange={setAiTarget} style={{ width: 100 }} options={[{value:'revenue',label:'Revenue'},{value:'expense',label:'Expense'},{value:'cashflow',label:'Cashflow'}]} />
              &nbsp;Ep: <InputNumber size="small" min={10} max={500} value={aiEpochs} onChange={v => setAiEpochs(Number(v)||50)} style={{ width: 60 }} />
              &nbsp;<Button size="small" loading={aiTraining} onClick={trainAI}>Train</Button>
              &nbsp;<Button size="small" onClick={predictAI}>Predict</Button>
            </div>
            <MiniBarChart data={aiPrediction.map((v, i) => ({ ym: `+${i+1}m`, value: Number(v) }))} labelKey="ym" valueKey="value" color="#13c2c2" height={100} />
          </Card>
        </Col>
      </Row>
    </div>
    </Spin>
  );
};

export default AnalyticsDashboard;


