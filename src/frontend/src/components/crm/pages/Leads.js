import React, { useEffect, useState } from 'react';

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('new');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const list = await window.electronAPI.crmListLeads();
      setLeads(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    setError('');
    if (!name) { setError('Name is required'); return; }
    await window.electronAPI.crmCreateLead({ name, company, status });
    setName(''); setCompany(''); setStatus('new');
    await load();
  };

  const remove = async (id) => {
    await window.electronAPI.crmDeleteLead(id);
    await load();
  };

  return (
    <div className="gx-p-4">
      <h2>CRM Leads</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Company" value={company} onChange={e => setCompany(e.target.value)} />
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <button onClick={add}>Add Lead</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Name</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Company</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Status</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr key={lead.id}>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{lead.name}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{lead.company || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{lead.status || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>
                <button onClick={() => remove(lead.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Leads;


