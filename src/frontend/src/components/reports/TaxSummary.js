import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Statistic, Row, Col, message, Divider, Tag } from 'antd';
import { PrinterOutlined, DownloadOutlined, DollarOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;

const TaxSummary = () => {
  const { symbol: cSym } = useCurrency();
  const [dateRange, setDateRange] = useState([
    moment().startOf('year'),
    moment().endOf('year')
  ]);
  const [loading, setLoading] = useState(false);
  const [taxRecords, setTaxRecords] = useState([]);
  const [vatData, setVatData] = useState([]);
  const [summary, setSummary] = useState({ totalTaxLiability: 0, totalTaxPaid: 0, totalVatCollected: 0, totalVatPaid: 0 });

  useEffect(() => {
    if (dateRange && dateRange[0] && dateRange[1]) loadReport();
  }, [dateRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [taxes, vat] = await Promise.all([
        window.electronAPI.getTaxRecords?.() || [],
        window.electronAPI.getVatReport?.(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')) || []
      ]);

      const taxArr = Array.isArray(taxes) ? taxes : [];
      const vatArr = Array.isArray(vat) ? vat : [];

      setTaxRecords(taxArr);
      setVatData(vatArr);

      const totalTaxLiability = taxArr.reduce((s, r) => s + (Number(r.amount || r.tax_amount || 0)), 0);
      const totalTaxPaid = taxArr.filter(r => (r.status || '').toLowerCase() === 'paid').reduce((s, r) => s + (Number(r.amount || r.tax_amount || 0)), 0);
      const totalVatCollected = vatArr.reduce((s, r) => s + (Number(r.total_vat_sum || r.output_vat || 0)), 0);
      const totalVatPaid = 0; // Input VAT from expenses not yet tracked per rate

      setSummary({ totalTaxLiability, totalTaxPaid, totalVatCollected, totalVatPaid });
    } catch (e) {
      message.error(e?.message || 'Failed to load tax summary');
    } finally { setLoading(false); }
  };

  const handlePrint = () => window.print();

  const handleExport = () => {
    try {
      const lines = ['Tax Summary Report', `Period: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')}`, ''];
      lines.push('--- Tax Filing Records ---');
      lines.push('Type,Period,Amount,Status');
      for (const r of taxRecords) {
        lines.push(`"${r.tax_type || r.type || ''}","${r.period || ''}",${Number(r.amount || r.tax_amount || 0).toFixed(2)},"${r.status || ''}"`);
      }
      lines.push('');
      lines.push('--- VAT Summary ---');
      lines.push('Name,Rate,Output VAT,Input VAT');
      for (const r of vatData) {
        lines.push(`"${r.vat_name || r.name || ''}",${r.vat_percentage || r.rate || 0},${Number(r.output_vat || r.vat_collected || 0).toFixed(2)},${Number(r.input_vat || r.vat_paid || 0).toFixed(2)}`);
      }
      lines.push('');
      lines.push(`Total Tax Liability,${summary.totalTaxLiability.toFixed(2)}`);
      lines.push(`Total Tax Paid,${summary.totalTaxPaid.toFixed(2)}`);
      lines.push(`Total VAT Collected,${summary.totalVatCollected.toFixed(2)}`);
      lines.push(`Total VAT Paid,${summary.totalVatPaid.toFixed(2)}`);
      lines.push(`Net VAT,${(summary.totalVatCollected - summary.totalVatPaid).toFixed(2)}`);

      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-summary-${dateRange[0].format('YYYY')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error('Export failed');
    }
  };

  const taxColumns = [
    { title: 'Type', dataIndex: 'tax_type', key: 'type', render: (v, r) => v || r.type || '-' },
    { title: 'Period', dataIndex: 'period', key: 'period', width: 120 },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, render: (v, r) => `${cSym} ${(Number(v || r.tax_amount || 0)).toFixed(2)}` },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due', width: 110 },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: v => {
      const s = (v || '').toLowerCase();
      const color = s === 'paid' ? 'green' : s === 'filed' ? 'blue' : s === 'overdue' ? 'red' : 'default';
      return <Tag color={color}>{v || 'Pending'}</Tag>;
    }},
  ];

  const vatColumns = [
    { title: 'VAT Rate', key: 'name', render: (_, r) => r.vat_name || `VAT ${r.vat || r.vat_percentage || 0}%` },
    { title: 'Rate', key: 'rate', width: 80, render: (_, r) => `${r.vat || r.vat_percentage || 0}%` },
    { title: 'Net Sales', key: 'net_sales', width: 140, render: (_, r) => `${cSym} ${(Number(r.pure_amount || 0)).toFixed(2)}` },
    { title: 'Output VAT (Collected)', key: 'output', width: 160, render: (_, r) => `${cSym} ${(Number(r.total_vat_sum || r.output_vat || 0)).toFixed(2)}` },
    { title: 'Total Revenue', key: 'total', width: 140, render: (_, r) => `${cSym} ${(Number(r.revenue_total_amount || 0)).toFixed(2)}` },
  ];

  const netVat = summary.totalVatCollected - summary.totalVatPaid;
  const outstanding = summary.totalTaxLiability - summary.totalTaxPaid;

  return (
    <div className="gx-p-4">
      <Card
        title={<span><DollarOutlined /> Tax Summary Report</span>}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RangePicker value={dateRange} onChange={setDateRange} allowClear={false} />
            <Button onClick={loadReport} loading={loading}>Refresh</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Export</Button>
          </div>
        }
      >
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic title="Total Tax Liability" value={summary.totalTaxLiability} precision={2} prefix={cSym} />
          </Col>
          <Col span={6}>
            <Statistic title="Total Tax Paid" value={summary.totalTaxPaid} precision={2} prefix={cSym} valueStyle={{ color: '#3f8600' }} />
          </Col>
          <Col span={6}>
            <Statistic title="Outstanding" value={outstanding} precision={2} prefix={cSym} valueStyle={{ color: outstanding > 0 ? '#cf1322' : '#3f8600' }} />
          </Col>
          <Col span={6}>
            <Statistic title="Net VAT Payable" value={netVat} precision={2} prefix={cSym} valueStyle={{ color: netVat >= 0 ? '#cf1322' : '#3f8600' }} />
          </Col>
        </Row>

        <Divider orientation="left">Tax Filing Records</Divider>
        <Table dataSource={taxRecords} columns={taxColumns} rowKey={(r, i) => r.id || i} size="small" pagination={{ pageSize: 15 }} loading={loading} />

        <Divider orientation="left">VAT Breakdown</Divider>
        <Table dataSource={vatData} columns={vatColumns} rowKey={(r, i) => r.id || i} size="small" pagination={false} loading={loading} />
      </Card>
    </div>
  );
};

export default TaxSummary;
