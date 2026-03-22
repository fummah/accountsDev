import React, { useEffect, useState } from 'react';

const Timesheets = () => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [entries, setEntries] = useState([]);
  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const loadProjects = async () => {
    const list = await window.electronAPI.getProjects();
    setProjects(Array.isArray(list) ? list : []);
  };
  const load = async () => {
    if (!projectId) return;
    setError('');
    try {
      const list = await window.electronAPI.listTimesheetsByProject(Number(projectId));
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };
  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { load(); }, [projectId]);

  const add = async () => {
    if (!projectId || !workDate || !hours) { setError('Fill project, date, hours'); return; }
    await window.electronAPI.logTime({ projectId: Number(projectId), workDate, hours: Number(hours), hourlyRate: rate ? Number(rate) : 0, notes });
    setWorkDate(''); setHours(''); setRate(''); setNotes('');
    await load();
  };
  const remove = async (id) => {
    await window.electronAPI.deleteTimesheet(id);
    await load();
  };

  const totals = entries.reduce((acc, e) => {
    acc.hours += Number(e.hours || 0);
    acc.amount += Number(e.amount || 0);
    return acc;
  }, { hours: 0, amount: 0 });

  return (
    <div className="gx-p-4">
      <h2>Timesheets</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div style={{ marginBottom: 8 }}>
        <label>Project</label><br/>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Select project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {projectId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} />
            <input placeholder="Hours" value={hours} onChange={e => setHours(e.target.value)} />
            <input placeholder="Hourly Rate" value={rate} onChange={e => setRate(e.target.value)} />
            <input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
            <button onClick={add}>Log Time</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Total Hours:</strong> {Number(totals.hours).toFixed(2)} {' '}
            <strong style={{ marginLeft: 12 }}>Total Amount:</strong> {Number(totals.amount).toFixed(2)}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Date</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Hours</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Rate</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Amount</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Notes</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{e.workDate}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(e.hours || 0)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(e.hourlyRate || 0)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(e.amount || 0).toFixed(2)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{e.notes || ''}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>
                    <button onClick={() => remove(e.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default Timesheets;


