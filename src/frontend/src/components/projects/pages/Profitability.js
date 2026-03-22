import React, { useEffect, useState } from 'react';

const Profitability = () => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState(null);
  const [unbilled, setUnbilled] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadProjects = async () => {
    const list = await window.electronAPI.getProjects();
    setProjects(Array.isArray(list) ? list : []);
  };
  useEffect(() => { loadProjects(); }, []);

  const load = async () => {
    if (!projectId) return;
    const d = await window.electronAPI.getProjectProfitability(Number(projectId));
    setData(d || null);
    try {
      const ts = await window.electronAPI.listTimesheetsByProject(Number(projectId));
      const cnt = (Array.isArray(ts) ? ts : []).filter(t => !t.billed).length;
      setUnbilled(cnt);
    } catch {}
  };
  useEffect(() => { load(); }, [projectId]);

  const profit = Number((data?.totalRevenue || 0) - (data?.totalExpense || 0));
  const margin = (data?.totalRevenue || 0) > 0 ? (profit / data.totalRevenue) * 100 : 0;

  const createInvoice = async () => {
    try {
      setBusy(true);
      const res = await window.electronAPI.projectInvoiceFromTimesheets({ projectId: Number(projectId) });
      if (res && res.success) {
        alert(`Created invoice #${res.invoiceId}`);
        await load();
      } else {
        alert(res?.error || 'Failed to create invoice');
      }
    } finally { setBusy(false); }
  };

  const blocks = [
    { label: 'Revenue', value: Number(data?.totalRevenue || 0), color: '#52c41a' },
    { label: 'Labour', value: Number(data?.labourCost || 0), color: '#1890ff' },
    { label: 'Material', value: Number(data?.materialCost || 0), color: '#faad14' },
    { label: 'Overhead', value: Number(data?.overheadCost || 0), color: '#eb2f96' },
  ];
  const maxVal = Math.max(...blocks.map(b => b.value), 1);

  return (
    <div className="gx-p-4">
      <h2>Project Profitability</h2>
      <div style={{ marginBottom: 8 }}>
        <label>Project</label><br/>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {projectId && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ padding: 12, border: '1px solid #eee' }}>
              <div>Total Revenue</div>
              <div style={{ fontSize: 20 }}>{Number(data?.totalRevenue || 0).toFixed(2)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #eee' }}>
              <div>Total Expense</div>
              <div style={{ fontSize: 20 }}>{Number(data?.totalExpense || 0).toFixed(2)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #eee' }}>
              <div>Profit</div>
              <div style={{ fontSize: 20 }}>{profit.toFixed(2)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #eee' }}>
              <div>Margin %</div>
              <div style={{ fontSize: 20 }}>{margin.toFixed(2)}%</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <h3>Costs by Type</h3>
            <div style={{ border: '1px solid #f0f0f0', padding: 8 }}>
              {blocks.map(b => (
                <div key={b.label} style={{ display:'flex', alignItems:'center', margin: '6px 0' }}>
                  <div style={{ width: 100 }}>{b.label}</div>
                  <div style={{ background:'#fafafa', height: 16, flex: 1, position:'relative' }}>
                    <div style={{ position:'absolute', left:0, top:0, bottom:0, width: `${(b.value/maxVal)*100}%`, background: b.color }} />
                  </div>
                  <div style={{ width: 100, textAlign:'right', marginLeft: 8 }}>{b.value.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <button disabled={!unbilled || busy} onClick={createInvoice}>
              {busy ? 'Creating...' : `Create invoice from unbilled time (${unbilled})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Profitability;


