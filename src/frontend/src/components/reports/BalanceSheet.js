import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Row, Col, Statistic } from 'antd';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const BalanceSheet = () => {
  const [date, setDate] = useState(moment());
  const [loading, setLoading] = useState(false);
  const [balanceSheet, setBalanceSheet] = useState({
    assets: [],
    liabilities: [],
    equity: [],
    summary: {
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0
    }
  });

  useEffect(() => {
    if (date) {
      loadBalanceSheet();
    }
  }, [date]);

  const loadBalanceSheet = async () => {
    try {
      setLoading(true);
      // Use unified financial report API and extract balanceSheet for the selected date range (same day)
      const report = await window.electronAPI.getFinancialReport(date.startOf('day').format('YYYY-MM-DD'), date.endOf('day').format('YYYY-MM-DD'));
      const data = report && report.balanceSheet ? report.balanceSheet : null;
      if (data) setBalanceSheet(data);
    } catch (error) {
      console.error('Failed to load balance sheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const assetColumns = [
    {
      title: 'Asset Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const liabilityColumns = [
    {
      title: 'Liability Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const equityColumns = [
    {
      title: 'Equity Category',
      dataIndex: 'category',
      key: 'category',
      render: (text, record) => record.isSubcategory ? <span style={{ paddingLeft: 20 }}>{text}</span> : <strong>{text}</strong>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Balance Sheet</h2>
        <div>
          <DatePicker 
            value={date}
            onChange={setDate}
            style={{ marginRight: '16px' }}
          />
          <Button icon={<PrinterOutlined />} style={{ marginRight: '8px' }} onClick={() => {
            try {
              const w = window.open('', '_blank');
              const assets = Array.isArray(balanceSheet?.assets) ? balanceSheet.assets : [];
              const liabilities = Array.isArray(balanceSheet?.liabilities) ? balanceSheet.liabilities : [];
              const equity = Array.isArray(balanceSheet?.equity) ? balanceSheet.equity : [];
              const summary = balanceSheet?.summary || { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
              const section = (title, rows) => `<h3>${title}</h3><table><thead><tr><th style="text-align:left">Category</th><th>Amount</th></tr></thead><tbody>${rows.map(r => `<tr><td style="text-align:left">${r.category}</td><td style="text-align:right">${Number(r.amount||0).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
              const html = `<!doctype html><html><head><title>Balance Sheet</title><style>table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #ddd;padding:6px}</style></head><body><h2>Balance Sheet</h2><p>Date: ${date.format('YYYY-MM-DD')}</p>${section('Assets', assets)}${section('Liabilities', liabilities)}${section('Equity', equity)}<h3>Totals</h3><p>Total Assets: $${Number(summary.totalAssets||0).toFixed(2)}<br/>Total Liabilities: $${Number(summary.totalLiabilities||0).toFixed(2)}<br/>Total Equity: $${Number(summary.totalEquity||0).toFixed(2)}</p></body></html>`;
              w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
            } catch (e) { /* noop */ }
          }}>
            Print
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => {
            try {
              const headers = ['section','category','amount'];
              const rows = [];
              (balanceSheet.assets||[]).forEach(r => rows.push(['Assets', r.category, r.amount]));
              (balanceSheet.liabilities||[]).forEach(r => rows.push(['Liabilities', r.category, r.amount]));
              (balanceSheet.equity||[]).forEach(r => rows.push(['Equity', r.category, r.amount]));
              const csvRows = rows.map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g,'""')}"`).join(','));
              const csv = [headers.join(','), ...csvRows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `balance_sheet_${date.format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            } catch (e) { /* noop */ }
          }}>
            Export
          </Button>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Assets"
              value={Number(balanceSheet?.summary?.totalAssets ?? 0)}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Liabilities"
              value={Number(balanceSheet?.summary?.totalLiabilities ?? 0)}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Equity"
              value={Number(balanceSheet?.summary?.totalEquity ?? 0)}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Assets" className="balance-sheet-card">
            <Table
              columns={assetColumns}
              dataSource={Array.isArray(balanceSheet?.assets) ? balanceSheet.assets : []}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Assets</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${Number(balanceSheet?.summary?.totalAssets ?? 0).toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
        
        <Col span={12}>
          <Card title="Liabilities" className="balance-sheet-card">
            <Table
              columns={liabilityColumns}
              dataSource={Array.isArray(balanceSheet?.liabilities) ? balanceSheet.liabilities : []}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Liabilities</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${Number(balanceSheet?.summary?.totalLiabilities ?? 0).toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>

          <Card title="Equity" className="balance-sheet-card" style={{ marginTop: '16px' }}>
            <Table
              columns={equityColumns}
              dataSource={Array.isArray(balanceSheet?.equity) ? balanceSheet.equity : []}
              pagination={false}
              rowKey="category"
              loading={loading}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell><strong>Total Equity</strong></Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <strong>${Number(balanceSheet?.summary?.totalEquity ?? 0).toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>

      <style jsx>{`
        .balance-sheet-card {
          margin-bottom: 16px;
        }
        .balance-sheet-card :global(.ant-card-body) {
          padding: 0;
        }
      `}</style>
    </div>
  );
};

export default BalanceSheet;