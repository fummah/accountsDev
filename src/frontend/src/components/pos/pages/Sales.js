import React, { useEffect, useState } from 'react';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const list = await window.electronAPI.posListSales();
      setSales(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="gx-p-4">
      <h2>POS Sales</h2>
      {error ? <div style={{ color: 'red' }}>{error}</div> : null}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>#</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Date</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Customer</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Total</th>
            <th style={{ border: '1px solid #ddd', padding: 6 }}>Payment</th>
          </tr>
        </thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id}>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.id}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.date}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.customerId || ''}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{Number(s.total || 0).toFixed(2)}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{s.paymentType || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Sales;


