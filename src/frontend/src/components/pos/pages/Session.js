import React, { useEffect, useState } from 'react';

const Session = () => {
  const [openSession, setOpenSession] = useState(null);
  const [openedBy, setOpenedBy] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const s = await window.electronAPI.posGetOpenSession();
      setOpenSession(s || null);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async () => {
    setLoading(true);
    setError('');
    try {
      await window.electronAPI.posOpenSession(openedBy || null, Number(openingAmount) || 0);
      setOpenedBy('');
      setOpeningAmount('');
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const close = async () => {
    if (!openSession?.id) return;
    setLoading(true);
    setError('');
    try {
      await window.electronAPI.posCloseSession(openSession.id, Number(closingAmount) || 0);
      setClosingAmount('');
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gx-p-4">
      <h2>POS Session</h2>
      {error ? <div style={{ color: 'red' }}>{error}</div> : null}
      {!openSession ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <label>Opened By</label><br/>
            <input value={openedBy} onChange={e => setOpenedBy(e.target.value)} placeholder="Name"/>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Opening Amount</label><br/>
            <input value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="0.00"/>
          </div>
          <button onClick={open} disabled={loading}>Open Session</button>
        </div>
      ) : (
        <div>
          <div>Session #{openSession.id} opened by {openSession.openedBy || 'N/A'} at {openSession.openedAt}</div>
          <div style={{ marginTop: 8 }}>
            <label>Closing Amount</label><br/>
            <input value={closingAmount} onChange={e => setClosingAmount(e.target.value)} placeholder="0.00"/>
          </div>
          <button onClick={close} disabled={loading} style={{ marginTop: 8 }}>Close Session</button>
        </div>
      )}
    </div>
  );
};

export default Session;


