import React, { useState } from 'react';
import { Card, Button, Space, Typography, Upload, message, Input, Divider } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

const QBImport = () => {
  const [section, setSection] = useState('customers');
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const templates = {
    company: {
      headers: ['Company Name','Registration Number','Industry','Business Type','Address','Email','Phone','Logo','Currency','Financial Year Start','VAT Rate','Default Invoice Terms','Bank Name','Account Number','Branch Code','Payment Methods'],
      rows: [
        ['Acme Holdings Pty Ltd','2023/123456/07','IT Services','Pty Ltd','1 Main St, Metropolis, NY','info@acme.com','555-0100','','USD','January','15','30','First National Bank','0123456789','250655','EFT,Cash,Card']
      ]
    },
    customers: {
      headers: ['Display Name','First Name','Last Name','Email','Phone','Mobile','Fax','Billing Address Line 1','Billing Address Line 2','City','State','Postal Code','Country','Terms','Open Balance','Open Balance Date','Tax Number'],
      rows: [
        ['Acme Holdings','John','Doe','john@acme.com','555-0100','555-0101','','1 Main St','','Metropolis','NY','10001','USA','Net 30','1200.00','2025-12-31','1234567890']
      ]
    },
    products: {
      headers: ['Type','Name','SKU','Category','Description','Sales Price/Rate','Income Account','Tax Code'],
      rows: [
        ['service','Consulting','','Services','Hourly consulting','150','Sales','Standard']
      ]
    },
    invoices: {
      headers: ['Invoice Number','Customer','Email','Invoice Date','Due Date','Billing Address Line 1','Product/Service','Description','Qty','Rate','Amount','Tax Rate','Terms','Status'],
      rows: [
        ['INV-1001','Acme Holdings','john@acme.com','2026-01-01','2026-01-31','1 Main St','Consulting','January consulting', '10','150','1500','0','Net 30','Pending']
      ]
    },
    payments: {
      headers: ['Invoice Number','Customer','Payment Amount','Payment Date','Payment Method'],
      rows: [
        ['INV-1001','Acme Holdings','1500','2026-01-15','EFT']
      ]
    },
    bills: {
      headers: ['Vendor','Bill No','Bill Date','Due Date','Expense Account','Description','Amount','Category','A/P Account'],
      rows: [
        ['Widgets Inc','B-7789','2026-01-05','2026-01-20','Office Supplies','Printer paper','85.50','Supplies','Accounts Payable']
      ]
    },
    balances: {
      headers: ['Customer','Open Balance','As Of Date'],
      rows: [
        ['Acme Holdings','350.00','2026-01-01']
      ]
    },
    vendors: {
      headers: ['Display Name','First Name','Last Name','Email','Phone','Mobile','Fax','Address1','Address2','City','State','Postal Code','Country','Terms','Account Number','Open Balance','Open Balance Date','Notes'],
      rows: [
        ['Widgets Inc','','','ap@widgets.com','555-0200','','','','100 Supplier Way','','Gotham','CA','90001','USA','Net 30','ACC-7789','0','2026-01-01','Preferred vendor']
      ]
    },
    tax: {
      headers: ['Tax Name','Rate'],
      rows: [
        ['Standard VAT','15']
      ]
    },
  };

  const makeCsv = (arr) => arr.map(row => row.map(cell => {
    const s = String(cell ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }).join(',')).join('\n');

  const copyTemplate = async () => {
    const t = templates[section];
    if (!t) return;
    const sample = [t.headers, ...(t.rows || [])];
    const text = makeCsv(sample);
    try {
      await navigator.clipboard.writeText(text);
      setCsv(text);
      message.success('Template copied and loaded');
    } catch {
      setCsv(text);
      message.info('Template loaded in editor (clipboard blocked)');
    }
  };

  const pickHandler = () => {
    switch (section) {
      case 'company': return window.electronAPI.importCompanyCsv;
      case 'customers': return window.electronAPI.importCustomersCsv;
      case 'vendors': return window.electronAPI.importSuppliersCsv;
      case 'products': return window.electronAPI.importProductsCsv;
      case 'invoices': return window.electronAPI.importInvoicesCsv;
      case 'payments': return window.electronAPI.importPaymentsCsv;
      case 'bills': return window.electronAPI.importBillsCsv;
      case 'balances': return window.electronAPI.importCustomerBalancesCsv;
      case 'tax': return window.electronAPI.importVatCsv;
      default: return window.electronAPI.importCustomersCsv;
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result || ''));
      message.success(`${file.name} loaded`);
    };
    reader.onerror = () => message.error('Failed to read file');
    reader.readAsText(file);
    return false;
  };

  const doImport = async () => {
    try {
      if (!csv.trim()) {
        message.warning('Paste CSV or upload a file first');
        return;
      }
      setLoading(true);
      const fn = pickHandler();
      const res = await fn(csv, { enteredBy: 'qb-import' });
      setResult(res);
      if (res?.success) message.success('Import completed');
      else message.error(res?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="QuickBooks CSV Import" style={{ margin: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={5} style={{ marginBottom: 8 }}>Select data type</Title>
          <Space wrap>
            <Button type={section==='company'?'primary':'default'} onClick={()=>setSection('company')}>My Company Settings</Button>
            <Button type={section==='customers'?'primary':'default'} onClick={()=>setSection('customers')}>Customers</Button>
            <Button type={section==='vendors'?'primary':'default'} onClick={()=>setSection('vendors')}>Vendors / Suppliers</Button>
            <Button type={section==='products'?'primary':'default'} onClick={()=>setSection('products')}>Products / Services</Button>
            <Button type={section==='invoices'?'primary':'default'} onClick={()=>setSection('invoices')}>Invoices</Button>
            <Button type={section==='payments'?'primary':'default'} onClick={()=>setSection('payments')}>Payments</Button>
            <Button type={section==='bills'?'primary':'default'} onClick={()=>setSection('bills')}>Unpaid Bills</Button>
            <Button type={section==='balances'?'primary':'default'} onClick={()=>setSection('balances')}>Customer Balances</Button>
            <Button type={section==='tax'?'primary':'default'} onClick={()=>setSection('tax')}>Tax Settings (VAT)</Button>
            <Button onClick={()=>{ setSection('coa'); message.info('Use COA Import/Export page for advanced options.'); }}>Chart of Accounts →</Button>
          </Space>
        </div>

        <Divider />

        <div>
          <Title level={5} style={{ marginBottom: 8 }}>Expected columns</Title>
          <Space wrap>
            {(templates[section]?.headers || []).map((h, i) => (
              <span key={i} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{h}</span>
            ))}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Button onClick={copyTemplate}>Copy Template CSV</Button>
          </div>
        </div>

        <Divider />

        <div>
          <Title level={5} style={{ marginBottom: 8 }}>Upload or paste CSV</Title>
          <Upload beforeUpload={handleFile} showUploadList={false} accept=".csv,.txt">
            <Button icon={<UploadOutlined />}>Upload CSV</Button>
          </Upload>
          <div style={{ marginTop: 12 }}>
            <TextArea rows={12} value={csv} onChange={e=>setCsv(e.target.value)} placeholder="Paste CSV content here" />
          </div>
        </div>

        <div>
          <Button type="primary" loading={loading} onClick={doImport}>Import</Button>
        </div>

        {result && (
          <div style={{ marginTop: 12 }}>
            <Title level={5}>Result</Title>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        <Divider />
        <Text type="secondary">
          Tip: Export from QuickBooks, choose the closest CSV export for each section. Column names are matched case-insensitively and with common aliases.
        </Text>
      </Space>
    </Card>
  );
};

export default QBImport;


