import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, InputNumber, DatePicker, Select, Button, Row, Col, message } from 'antd';
import moment from 'moment';

const { Option } = Select;

const toWords = (num) => {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const chunk = (n) => {
    let str = '';
    if (n >= 100) { str += a[Math.floor(n/100)] + ' Hundred '; n = n % 100; }
    if (n >= 20) { str += b[Math.floor(n/10)] + (n%10?'-'+a[n%10]:''); }
    else if (n > 0) { str += a[n]; }
    return str.trim();
  };
  if (num === 0) return 'Zero';
  let words = '';
  const billions = Math.floor(num / 1_000_000_000); if (billions) { words += chunk(billions) + ' Billion '; num %= 1_000_000_000; }
  const millions = Math.floor(num / 1_000_000); if (millions) { words += chunk(millions) + ' Million '; num %= 1_000_000; }
  const thousands = Math.floor(num / 1000); if (thousands) { words += chunk(thousands) + ' Thousand '; num %= 1000; }
  if (num) words += chunk(num);
  return words.trim();
};

const CheckPrinting = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [payees, setPayees] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [accRes, vendorsRes, customersRes, employeesRes] = await Promise.all([
          window.electronAPI.getChartOfAccounts(),
          window.electronAPI.getAllSuppliers().catch(() => []),
          window.electronAPI.getAllCustomers().catch(() => ({ all: [] })),
          window.electronAPI.getEmployees ? window.electronAPI.getEmployees().catch(()=>[]) : Promise.resolve([]),
        ]);
        const accs = Array.isArray(accRes) ? accRes : (accRes?.data || []);
        setAccounts(accs);
        const vendors = Array.isArray(vendorsRes) ? vendorsRes : (vendorsRes?.data || vendorsRes?.all || []);
        const customers = Array.isArray(customersRes?.all) ? customersRes.all : (Array.isArray(customersRes) ? customersRes : []);
        const employees = Array.isArray(employeesRes?.data) ? employeesRes.data : (Array.isArray(employeesRes) ? employeesRes : []);
        const merged = [
          ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || v.name || `${v.first_name||''} ${v.last_name||''}`.trim() })),
          ...customers.map(c => ({ id: `c-${c.id}`, name: c.display_name || `${c.first_name||''} ${c.last_name||''}`.trim() })),
          ...employees.map(e => ({ id: `e-${e.id}`, name: e.name || `${e.first_name||''} ${e.last_name||''}`.trim() })),
        ].filter(p => p.name);
        setPayees(merged);
      } catch (e) {
        setAccounts([]); setPayees([]);
      }
    })();
  }, []);

  const amount = Form.useWatch('amount', form) || 0;
  const amountWords = useMemo(() => {
    const n = Number(amount || 0);
    const dollars = Math.floor(n);
    const cents = Math.round((n - dollars) * 100);
    const head = toWords(dollars);
    const tail = cents > 0 ? `${cents}/100` : '00/100';
    return `${head} and ${tail} Dollars`;
  }, [amount]);

  const handlePrint = (vals) => {
    try {
      const dateStr = vals.date ? vals.date.format('YYYY-MM-DD') : '';
      const html = `<!doctype html><html><head><title>Check</title>
      <style>
        body{font-family:Arial;padding:24px}
        .check{width: 800px; border:1px solid #999; padding:16px}
        .row{display:flex; justify-content:space-between; margin-bottom:8px}
        .payee{margin:8px 0}
        .amount-box{border:1px solid #333; padding:4px 8px; min-width:140px; text-align:right}
        .memo{margin-top:32px; display:flex; justify-content:space-between}
        .micr{margin-top:24px; font-family: 'OCR A', monospace; letter-spacing:2px}
      </style></head><body>
      <div class="check">
        <div class="row"><div><strong>${vals.accountName || ''}</strong></div><div>${dateStr}</div></div>
        <div class="row"><div>Pay to the Order of: <strong>${vals.payeeName || ''}</strong></div><div class="amount-box">$${Number(vals.amount||0).toFixed(2)}</div></div>
        <div class="row"><div>Amount in Words: <strong>${amountWords}</strong></div></div>
        <div class="payee">Memo: ${vals.memo || ''}</div>
        <div class="row"><div>Authorized Signature: ____________________________</div><div>Check # ${vals.checkNumber || ''}</div></div>
        <div class="micr">${vals.routingNumber || '000000000'} ${vals.accountNumber || '0000000000'} ${String(vals.checkNumber||'').padStart(6,'0')}</div>
      </div>
      </body></html>`;
      const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(()=>w.print(), 300);
    } catch (e) {}
  };

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const selectedAccount = accounts.find(a => String(a.id) === String(values.accountId));
      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        type: 'Check',
        amount: Number(values.amount || 0),
        description: values.memo || `Check ${values.checkNumber || ''} to ${values.payeeName || ''}`,
        reference: values.checkNumber || undefined,
        accountId: Number(values.accountId),
        entered_by: 'system',
      };
      await window.electronAPI.insertTransaction(payload);
      message.success('Check recorded');
      const vals = {
        ...values,
        accountName: selectedAccount?.accountName || selectedAccount?.name,
      };
      handlePrint(vals);
      form.resetFields();
    } catch (e) {
      message.error('Failed to record check');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Check Printing">
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: moment() }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="accountId" label="Bank Account" rules={[{ required: true, message: 'Select bank account' }]}>
              <Select placeholder="Select account">
                {accounts.map(a => (
                  <Option key={a.id} value={a.id}>{a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="checkNumber" label="Check Number" rules={[{ required: true, message: 'Enter check number' }]}>
              <Input placeholder="e.g. 1001" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="payee" label="Payee">
              <Select showSearch optionFilterProp="children" placeholder="Select payee" onChange={(val, opt)=> form.setFieldsValue({ payeeName: opt?.children })}>
                {payees.map(p => (
                  <Option key={p.id} value={p.id}>{p.name}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="payeeName" label="Payee Name (override)">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="$" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="Amount in Words">
              <Input value={amountWords} readOnly />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="routingNumber" label="Routing Number">
              <Input placeholder="Optional (for MICR line)" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="accountNumber" label="Account Number">
              <Input placeholder="Optional (for MICR line)" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="memo" label="Memo">
          <Input placeholder="Optional" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => handlePrint(form.getFieldsValue(true))}>Preview / Print</Button>
          <Button type="primary" htmlType="submit" loading={loading}>Record & Print</Button>
        </div>
      </Form>
    </Card>
  );
};

export default CheckPrinting;


