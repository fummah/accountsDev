import React, { useEffect, useState } from 'react';

const Statements = () => {
  const [statements, setStatements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  const load = async () => {
    const list = await window.electronAPI.listParsedStatements();
    setStatements(Array.isArray(list) ? list : []);
  };
  useEffect(() => { load(); }, []);

  const open = async (st) => {
    setSelected(st);
    const d = await window.electronAPI.getParsedStatement(st.id);
    setDetails(d || null);
  };

  return (
    <div className="gx-p-4">
      <h2>Parsed Bank Statements</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>#</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Bank</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Period</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Currency</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {statements.map(s => (
            <tr key={s.id}>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.id}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.bankName || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.periodStart || ''} - {s.periodEnd || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.currency || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}><button onClick={() => open(s)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {details && (
        <div>
          <h3>Statement #{selected?.id} Transactions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Date</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Description</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Amount</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {(details.transactions || []).map((t, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{t.date}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{t.description || ''}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(t.amount || 0).toFixed(2)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{t.type || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Statements;


