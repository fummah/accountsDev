import React, { useEffect, useState } from 'react';

const NewSale = () => {
  const [session, setSession] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [lines, setLines] = useState([{ itemId: '', quantity: 1, price: 0 }]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const s = await window.electronAPI.posGetOpenSession();
      setSession(s || null);
    };
    load();
  }, []);

  const setLine = (idx, field, value) => {
    const copy = [...lines];
    copy[idx] = { ...copy[idx], [field]: value };
    setLines(copy);
  };
  const addLine = () => setLines([...lines, { itemId: '', quantity: 1, price: 0 }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));

  const submit = async () => {
    setMessage('');
    if (!session?.id) { setMessage('Open a session first.'); return; }
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0);
    const tax = 0;
    const total = subtotal + tax;
    const sale = { sessionId: session.id, customerId: customerId ? Number(customerId) : null, subtotal, tax, total, paymentType };
    const cleanLines = lines.map(l => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), price: Number(l.price) }));
    const res = await window.electronAPI.posCreateSale(sale, cleanLines);
    if (res?.success) {
      setMessage(`Sale #${res.id} created`);
      setLines([{ itemId: '', quantity: 1, price: 0 }]);
    } else {
      setMessage(res?.error || 'Failed to create sale');
    }
  };

  return (
    <div className="gx-p-4">
      <h2>New POS Sale</h2>
      {!session && <div style={{ color: 'red' }}>No open session</div>}
      <div style={{ marginBottom: 8 }}>
        <label>Customer Id (optional)</label><br/>
        <input value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="Customer ID"/>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Payment Type</label><br/>
        <select value={paymentType} onChange={e => setPaymentType(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mobile">Mobile</option>
        </select>
      </div>
      <h3>Lines</h3>
      {lines.map((l, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input style={{ width: 100 }} placeholder="Item Id" value={l.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}/>
          <input style={{ width: 80 }} placeholder="Qty" value={l.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)}/>
          <input style={{ width: 100 }} placeholder="Price" value={l.price} onChange={e => setLine(idx, 'price', e.target.value)}/>
          <button onClick={() => removeLine(idx)}>Remove</button>
        </div>
      ))}
      <button onClick={addLine} style={{ marginBottom: 8 }}>Add Line</button><br/>
      <button onClick={submit}>Create Sale</button>
      {message && <div style={{ marginTop: 8 }}>{message}</div>}
    </div>
  );
};

export default NewSale;


