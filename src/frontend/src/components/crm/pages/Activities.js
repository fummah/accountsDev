import React, { useEffect, useState } from 'react';

const Activities = () => {
  const [activities, setActivities] = useState([]);
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('call');
  const [status, setStatus] = useState('open');

  const load = async () => {
    const list = await window.electronAPI.crmListActivities({});
    setActivities(Array.isArray(list) ? list : []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!subject) return;
    await window.electronAPI.crmCreateActivity({ subject, type, status });
    setSubject(''); setType('call'); setStatus('open');
    await load();
  };
  const remove = async (id) => {
    await window.electronAPI.crmDeleteActivity(id);
    await load();
  };
  return (
    <div className="gx-p-4">
      <h2>CRM Activities</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
          <option value="task">Task</option>
          <option value="note">Note</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="canceled">Canceled</option>
        </select>
        <button onClick={add}>Add Activity</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Subject</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Type</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Status</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {activities.map(a => (
            <tr key={a.id}>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{a.subject || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{a.type || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{a.status || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>
                <button onClick={() => remove(a.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Activities;


