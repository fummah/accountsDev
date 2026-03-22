import React, { useEffect, useState } from 'react';

const ProjectsCenter = () => {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ id: null, name: '', code: '', budget: '', status: 'active' });
  const [links, setLinks] = useState([]);
  const [linkForm, setLinkForm] = useState({ projectId: '', direction: 'revenue', amount: '', linkType: 'other', linkedId: '' });
  const [profit, setProfit] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const list = await window.electronAPI.getProjects();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };
  useEffect(() => { load(); }, []);

  const open = async (p) => {
    setForm({ id: p.id, name: p.name || '', code: p.code || '', budget: p.budget || '', status: p.status || 'active' });
    const l = await window.electronAPI.listProjectLinks(p.id);
    setLinks(Array.isArray(l) ? l : []);
    const prof = await window.electronAPI.getProjectProfitability(p.id);
    setProfit(prof || null);
    setLinkForm({ projectId: p.id, direction: 'revenue', amount: '', linkType: 'other', linkedId: '' });
  };

  const save = async () => {
    setError('');
    if (!form.name) { setError('Name required'); return; }
    if (form.id) {
      await window.electronAPI.updateProject({ ...form, budget: Number(form.budget) || 0 });
    } else {
      await window.electronAPI.createProject({ name: form.name, code: form.code || null, budget: Number(form.budget) || 0, status: form.status || 'active' });
    }
    setForm({ id: null, name: '', code: '', budget: '', status: 'active' });
    await load();
  };

  const remove = async (id) => {
    await window.electronAPI.deleteProject(id);
    await load();
  };

  const addLink = async () => {
    if (!linkForm.projectId || !linkForm.amount) return;
    await window.electronAPI.addProjectLink(linkForm.projectId, linkForm.linkType, linkForm.linkedId ? Number(linkForm.linkedId) : null, linkForm.direction, Number(linkForm.amount));
    const l = await window.electronAPI.listProjectLinks(linkForm.projectId);
    setLinks(Array.isArray(l) ? l : []);
    const prof = await window.electronAPI.getProjectProfitability(linkForm.projectId);
    setProfit(prof || null);
    setLinkForm({ ...linkForm, amount: '', linkedId: '' });
  };

  return (
    <div className="gx-p-4">
      <h2>Projects</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Budget" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={save}>{form.id ? 'Update' : 'Create'}</button>
        {form.id && <button onClick={() => setForm({ id: null, name: '', code: '', budget: '', status: 'active' })}>Cancel</button>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>#</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Name</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Code</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Budget</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Status</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.id}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.name}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.code || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(r.budget || 0).toFixed(2)}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.status}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>
                <button onClick={() => open(r)} style={{ marginRight: 6 }}>Open</button>
                <button onClick={() => remove(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {form.id && (
        <>
          <h3>Links & Profitability (Project #{form.id})</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={linkForm.direction} onChange={e => setLinkForm({ ...linkForm, direction: e.target.value })}>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
            <input placeholder="Amount" value={linkForm.amount} onChange={e => setLinkForm({ ...linkForm, amount: e.target.value })} />
            <select value={linkForm.linkType} onChange={e => setLinkForm({ ...linkForm, linkType: e.target.value })}>
              <option value="transaction">Transaction</option>
              <option value="invoice">Invoice</option>
              <option value="expense">Expense</option>
              <option value="other">Other</option>
            </select>
            <input placeholder="Linked Id (optional)" value={linkForm.linkedId} onChange={e => setLinkForm({ ...linkForm, linkedId: e.target.value })} />
            <button onClick={addLink}>Add Link</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Profit:</strong> {profit ? Number((profit.totalRevenue || 0) - (profit.totalExpense || 0)).toFixed(2) : '...'} {' '}
            <span style={{ marginLeft: 12 }}><strong>Revenue:</strong> {profit ? Number(profit.totalRevenue || 0).toFixed(2) : '...'}</span>
            <span style={{ marginLeft: 12 }}><strong>Expense:</strong> {profit ? Number(profit.totalExpense || 0).toFixed(2) : '...'}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Type</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Direction</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Amount</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Linked Id</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{l.linkType}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{l.direction}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(l.amount || 0).toFixed(2)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{l.linkedId || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default ProjectsCenter;


