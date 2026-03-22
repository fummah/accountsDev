import React, { useEffect, useState } from 'react';
import { Card, Table, Button, message } from 'antd';

const PayBills = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadBills(); }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllExpenses();
      const list = Array.isArray(data) ? data : (data && data.data) ? data.data : [];
      // filter supplier bills unpaid
      setBills(list.filter(b => b.category === 'supplier' && (b.approval_status || '').toLowerCase() !== 'paid'));
    } catch (err) {
      console.error('Failed to load bills', err);
      message.error('Failed to load bills');
      setBills([]);
    } finally { setLoading(false); }
  };

  const handlePay = async (record) => {
    try {
      setLoading(true);
      // create a payment transaction for the bill
      const tx = {
        date: record.payment_date || new Date().toISOString().slice(0,10),
        type: 'Bill Payment',
        amount: record.amount || 0,
        description: `Payment for bill ${record.ref_no || record.id}`,
        entered_by: 'system'
      };
      await window.electronAPI.insertTransaction(tx);
      // mark expense as paid
      const res = await window.electronAPI.markExpensePaid(record.id);
      if (res && res.success) {
        message.success('Payment recorded and bill marked as paid');
        await loadBills();
      } else {
        message.error('Payment recorded but failed to mark bill paid');
      }
    } catch (err) {
      console.error('Failed to pay bill', err);
      message.error('Failed to pay bill');
    } finally { setLoading(false); }
  };

  const columns = [
    { title: 'Bill #', dataIndex: 'ref_no', key: 'ref_no' },
    { title: 'Vendor', dataIndex: 'payee_name', key: 'payee_name' },
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => `$${Number(a||0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'approval_status', key: 'status' },
    { title: 'Action', key: 'action', render: (_, r) => <Button type="primary" onClick={() => handlePay(r)}>Pay</Button> }
  ];

  return (
    <Card title="Pay Bills">
      <Table columns={columns} dataSource={bills} loading={loading} rowKey={r => r.id} />
    </Card>
  );
};

export default PayBills;
