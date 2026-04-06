import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Statistic, Row, Col, message, Divider } from 'antd';
import { PrinterOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;

const VATReturn = () => {
  const { symbol: cSym } = useCurrency();
  const [dateRange, setDateRange] = useState([
    moment().startOf('quarter'),
    moment().endOf('quarter')
  ]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ rows: [], summary: { totalOutput: 0, totalInput: 0, netVat: 0 } });

  useEffect(() => {
    if (dateRange && dateRange[0] && dateRange[1]) loadReport();
  }, [dateRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getVatReport?.(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      );
      if (Array.isArray(result)) {
        let totalOutput = 0, totalInput = 0;
        const rows = result.map((r, idx) => {
          const vatRate = Number(r.vat || r.vat_percentage || 0);
          const pureAmount = Number(r.pure_amount || 0);
          const output = Number(r.total_vat_sum || r.output_vat || 0);
          const input = 0; // Input VAT from expenses not yet tracked per rate
          totalOutput += output;
          totalInput += input;
          return {
            key: idx, vat_name: `VAT ${vatRate}%`, vat_percentage: vatRate,
            pure_amount: pureAmount, output_vat: output, input_vat: input,
            net: output - input, revenue_total: Number(r.revenue_total_amount || 0)
          };
        });
        setData({ rows, summary: { totalOutput, totalInput, netVat: totalOutput - totalInput } });
      } else if (result && result.data) {
        setData({ rows: result.data, summary: result.summary || { totalOutput: 0, totalInput: 0, netVat: 0 } });
      } else {
        setData({ rows: [], summary: { totalOutput: 0, totalInput: 0, netVat: 0 } });
      }
    } catch (e) {
      message.error(e?.message || 'Failed to load VAT report');
    } finally { setLoading(false); }
  };

  const handlePrint = () => window.print();

  const handleExport = () => {
    try {
      const headers = ['VAT Name', 'Rate %', 'Output VAT', 'Input VAT', 'Net VAT'];
      const csvRows = [headers.join(',')];
      for (const r of data.rows) {
        csvRows.push([
          `"${r.vat_name || r.name || ''}"`,
          r.vat_percentage || r.rate || 0,
          (r.output_vat || 0).toFixed(2),
          (r.input_vat || 0).toFixed(2),
          (r.net || 0).toFixed(2)
        ].join(','));
      }
      csvRows.push(['', '', data.summary.totalOutput.toFixed(2), data.summary.totalInput.toFixed(2), data.summary.netVat.toFixed(2)].join(','));
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vat-return-${dateRange[0].format('YYYY-MM-DD')}-${dateRange[1].format('YYYY-MM-DD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error('Export failed');
    }
  };

  const columns = [
    { title: 'VAT Name', dataIndex: 'vat_name', key: 'name', render: (v, r) => v || r.name || '-' },
    { title: 'Rate %', dataIndex: 'vat_percentage', key: 'rate', width: 90, render: (v, r) => `${v || r.rate || 0}%` },
    { title: 'Output VAT (Collected)', dataIndex: 'output_vat', key: 'output', width: 160, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Input VAT (Paid)', dataIndex: 'input_vat', key: 'input', width: 140, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Net VAT', dataIndex: 'net', key: 'net', width: 120, render: v => {
      const n = Number(v) || 0;
      return <span style={{ color: n >= 0 ? '#cf1322' : '#3f8600', fontWeight: 'bold' }}>{cSym} {n.toFixed(2)}</span>;
    }},
  ];

  return (
    <div className="gx-p-4">
      <Card
        title={<span><FileTextOutlined /> VAT Return Report</span>}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RangePicker value={dateRange} onChange={setDateRange} picker="quarter" allowClear={false} />
            <Button onClick={loadReport} loading={loading}>Refresh</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Export CSV</Button>
          </div>
        }
      >
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Statistic title="Output VAT (Collected)" value={data.summary.totalOutput} precision={2} prefix={cSym} />
          </Col>
          <Col span={8}>
            <Statistic title="Input VAT (Paid)" value={data.summary.totalInput} precision={2} prefix={cSym} />
          </Col>
          <Col span={8}>
            <Statistic
              title="Net VAT Payable"
              value={data.summary.netVat}
              precision={2}
              prefix={cSym}
              valueStyle={{ color: data.summary.netVat >= 0 ? '#cf1322' : '#3f8600' }}
            />
          </Col>
        </Row>

        <Divider orientation="left">VAT Breakdown</Divider>

        <Table
          dataSource={data.rows}
          columns={columns}
          rowKey="key"
          loading={loading}
          size="small"
          pagination={false}
          summary={() => (
            <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
              <Table.Summary.Cell index={0} colSpan={2}>TOTALS</Table.Summary.Cell>
              <Table.Summary.Cell index={2}>${data.summary.totalOutput.toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={3}>${data.summary.totalInput.toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={4}>
                <span style={{ color: data.summary.netVat >= 0 ? '#cf1322' : '#3f8600' }}>
                  ${data.summary.netVat.toFixed(2)}
                </span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />

        <div style={{ marginTop: 16, padding: 12, background: '#f6f8fa', borderRadius: 4, fontSize: 12, color: '#666' }}>
          <strong>Note:</strong> Positive Net VAT = amount owed to tax authority. Negative = refund due.
          Period: {dateRange[0]?.format('MMM D, YYYY')} – {dateRange[1]?.format('MMM D, YYYY')}
        </div>
      </Card>
    </div>
  );
};

export default VATReturn;
