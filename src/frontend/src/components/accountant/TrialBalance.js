import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Card, Table, DatePicker, Select, Button, Alert, Form, Row, Col, message } from 'antd';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TrialBalance = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Load default trial balance on mount
    (async () => {
      // load an initial full-range trial balance (no dates => all)
      await loadTrialBalance();
    })();
  }, []);

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
    },
  ];

  // load trial balance from backend (chart of accounts balances)
  const loadTrialBalance = async (params) => {
    try {
      setLoading(true);
      // If params contains dateRange, call backend trial-balance by date.
      if (params && params.dateRange) {
        try {
          const [startMoment, endMoment] = params.dateRange;
          const start = (startMoment && startMoment.format) ? startMoment.format('YYYY-MM-DD') : null;
          const end = (endMoment && endMoment.format) ? endMoment.format('YYYY-MM-DD') : null;
          const tb = await window.electronAPI.getTrialBalance(start, end);
          if (!tb || tb.error) {
            message.error(tb?.error || 'Failed to load trial balance');
            setData([]);
          } else {
            const rows = tb.map((r, idx) => ({
              key: r.accountId || idx,
              accountCode: r.accountCode || r.accountNumber || '',
              accountName: r.accountName || '',
              debit: (Number(r.debit) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
              credit: (Number(r.credit) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
              _raw: r
            }));
            setData(rows);
          }
        } catch (err) {
          console.error('Failed to load trial balance by date:', err);
          message.error('Failed to load trial balance');
          setData([]);
        }
      } else {
        // fallback: load chart of accounts snapshot if no dates were provided
        const accounts = await window.electronAPI.getChartOfAccounts();
        if (!accounts || accounts.error) {
          message.error(accounts?.error || 'Failed to load trial balance');
          setData([]);
          return;
        }

        const rows = Array.isArray(accounts) ? accounts.map((acc, idx) => {
          const balance = Number(acc.balance) || 0;
          const type = (acc.accountType || acc.type || '').toLowerCase();

          let debit = 0;
          let credit = 0;

          // Basic rule: assets & expenses are debit-normal; liabilities, equity, income are credit-normal
          const debitNormal = type.includes('asset') || type.includes('expense');

          if (balance >= 0) {
            if (debitNormal) debit = balance; else credit = balance;
          } else {
            // negative balance flips side
            if (debitNormal) credit = Math.abs(balance); else debit = Math.abs(balance);
          }

          return {
            key: acc.id || idx,
            accountCode: acc.accountNumber || acc.number || acc.accountCode || acc.accountCode || '',
            accountName: acc.accountName || acc.name || acc.accountName || '',
            debit: debit.toLocaleString('en-US', { minimumFractionDigits: 2 }),
            credit: credit.toLocaleString('en-US', { minimumFractionDigits: 2 }),
          };
        }) : [];

        setData(rows);
      }
    } catch (error) {
      console.error('Failed to load trial balance:', error);
      message.error('Failed to load trial balance');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    // TODO: pass dateRange and balanceType to backend when supported
    await loadTrialBalance(values);
  };

  // Export current data to CSV
  const handleExport = () => {
    try {
      if (!data || data.length === 0) {
        message.warning('No data to export');
        return;
      }

      const headers = ['Account Code', 'Account Name', 'Debit', 'Credit'];
      const csvRows = [headers.join(',')];
      data.forEach(r => {
        const row = [
          `"${(r.accountCode || '').toString().replace(/"/g, '""')}"`,
          `"${(r.accountName || '').toString().replace(/"/g, '""')}"`,
          `${(r.debit || '0').toString().replace(/,/g, '')}`,
          `${(r.credit || '0').toString().replace(/,/g, '')}`,
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trial-balance-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      message.error('Export failed');
    }
  };

  // Export to XLSX using sheetjs
  const handleExportXLSX = () => {
    try {
      if (!data || data.length === 0) {
        message.warning('No data to export');
        return;
      }

      // Prepare sheet data preserving numeric values
      const sheetData = data.map(r => ({
        'Account Code': r.accountCode || '',
        'Account Name': r.accountName || '',
        'Debit': parseFloat((r.debit || '0').toString().replace(/,/g, '')) || 0,
        'Credit': parseFloat((r.credit || '0').toString().replace(/,/g, '')) || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trial-balance-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('XLSX export failed', err);
      message.error('Export failed');
    }
  };

  // Print current data (opens new window and triggers print)
  const handlePrint = () => {
    try {
      if (!data || data.length === 0) {
        message.warning('No data to print');
        return;
      }

      const rowsHtml = data.map(r => `
        <tr>
          <td>${r.accountCode || ''}</td>
          <td>${r.accountName || ''}</td>
          <td style="text-align:right">${r.debit || '0.00'}</td>
          <td style="text-align:right">${r.credit || '0.00'}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <head>
            <title>Trial Balance</title>
            <style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}</style>
          </head>
          <body>
            <h2>Trial Balance</h2>
            <table>
              <thead>
                <tr><th>Account Code</th><th>Account Name</th><th>Debit</th><th>Credit</th></tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 300);
    } catch (err) {
      console.error('Print failed', err);
      message.error('Print failed');
    }
  };

  return (
    <Card title="Working Trial Balance">
      <Form onFinish={onFinish} layout="vertical">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="dateRange"
              label="Date Range"
              rules={[{ required: true, message: 'Please select date range' }]}
            >
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="balanceType"
              label="Balance Type"
              rules={[{ required: true, message: 'Please select balance type' }]}
            >
              <Select>
                <Option value="unadjusted">Unadjusted</Option>
                <Option value="adjusted">Adjusted</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" " colon={false}>
              <Button type="primary" htmlType="submit" loading={loading}>
                Generate Trial Balance
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        summary={pageData => {
          let totalDebit = 0;
          let totalCredit = 0;

          pageData.forEach(({ debit, credit }) => {
            const d = parseFloat((debit || '0').toString().replace(/,/g, '')) || 0;
            const c = parseFloat((credit || '0').toString().replace(/,/g, '')) || 0;
            totalDebit += d;
            totalCredit += c;
          });

          return (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>Difference</Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} align="right">
                  {Math.abs(totalDebit - totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          );
        }}
      />

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Button type="primary" style={{ marginRight: 8 }} onClick={handleExport} disabled={!data || data.length === 0}>
          Export to CSV
        </Button>
        <Button type="default" style={{ marginRight: 8 }} onClick={handleExportXLSX} disabled={!data || data.length === 0}>
          Export to XLSX
        </Button>
        <Button onClick={handlePrint} disabled={!data || data.length === 0}>
          Print
        </Button>
      </div>
    </Card>
  );
};

export default TrialBalance;