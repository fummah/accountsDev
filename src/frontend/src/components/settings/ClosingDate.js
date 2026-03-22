import React, { useEffect, useState } from 'react';
import { Card, DatePicker, Button, message } from 'antd';
import moment from 'moment';

const ClosingDate = () => {
  const [date, setDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('Staff');

  const load = async () => {
    try {
      const me = await window.electronAPI.getMe().catch(() => null);
      setRole(me?.user?.role || 'Staff');
      const res = await window.electronAPI.getClosingDate();
      if (res && res.success) {
        setDate(res.closingDate ? moment(res.closingDate) : null);
      }
    } catch (e) {
      // noop
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (role !== 'Admin') {
      message.error('Only Admin can change closing date');
      return;
    }
    setLoading(true);
    try {
      const d = date ? date.format('YYYY-MM-DD') : null;
      if (d) {
        const res = await window.electronAPI.setClosingDate(d);
        if (res?.success) message.success('Closing date saved');
        else message.error(res?.error || 'Failed to save');
      } else {
        const res = await window.electronAPI.clearClosingDate();
        if (res?.success) message.success('Closing date cleared');
        else message.error(res?.error || 'Failed to clear');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Closing Date</h2>
      <Card>
        <p>Transactions and journal entries on or before the closing date are blocked.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DatePicker value={date} onChange={setDate} />
          <Button type="primary" onClick={save} loading={loading} disabled={role !== 'Admin'}>Save</Button>
          <Button onClick={() => setDate(null)} disabled={role !== 'Admin'}>Clear</Button>
        </div>
        {role !== 'Admin' ? <p style={{ color: '#999', marginTop: 8 }}>Read-only: Admin required to change closing date</p> : null}
      </Card>
    </div>
  );
};

export default ClosingDate;


