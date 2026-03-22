import React, { useEffect, useState, useCallback } from 'react';
import { Col, Row, Card, Progress, Alert, Spin } from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import styled from 'styled-components';
import SalesList from "components/Inner/Sales/AllSales/SalesList";
import AddTransaction from 'components/Inner/Sales/AllSales/AddTransaction';

const formattedNumber = (number) => {
  const safe = Number(number || 0);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
};

const taxInclusiveAmount = (amount, vat) => {
  const base = Number(amount || 0);
  const rate = Number(vat || 0);
  return base + (base * rate / 100);
};

const ProgressBar = styled(Progress)` 
  .ant-progress-inner {
    background-color: ${(props) => props.bgcolor};
  }
`;

const PAGE_SIZE = 25;

const AllSalesTab = () => {
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [salesData, setSalesData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch report for cards only (lightweight)
  useEffect(() => {
    let mounted = true;
    const fetchCards = async () => {
      setCardsLoading(true);
      try {
        const [invoiceReportRes, customersRes] = await Promise.all([
          window.electronAPI.getInvoiceReport().catch(() => null),
          window.electronAPI.getCustomerReport ? window.electronAPI.getCustomerReport().catch(() => null) : Promise.resolve(null)
        ]);
        if (!mounted) return;
        const invoiceReport = (invoiceReportRes && !invoiceReportRes.error) ? invoiceReportRes : {};
        const customerReport = (customersRes && customersRes.success) ? (customersRes.report || {}) : {};
        const overdueAmt = invoiceReport?.due_invoice?.[0]?.due_total_amount || 0;
        const overdueCount = invoiceReport?.due_invoice?.[0]?.due_invoice || 0;
        const openAmt = invoiceReport?.open_invoice?.[0]?.open_total_amount || 0;
        const openCount = invoiceReport?.open_invoice?.[0]?.open_invoice || 0;
        const paidAmt = invoiceReport?.paid_invoice?.[0]?.paid_total_amount || 0;
        const paidCount = invoiceReport?.paid_invoice?.[0]?.paid_invoice || 0;
        const estAmt = customerReport?.due_quote?.[0]?.due_total_amount || 0;
        const estCount = customerReport?.due_quote?.[0]?.due_quote || 0;
        setCards([
          { title: `$${formattedNumber(estAmt)}`, description: `${estCount} estimates`, color: '#40a9ff', wd: 6 },
          { title: `$${formattedNumber(overdueAmt)}`, description: `${overdueCount} overdue invoices`, color: '#fa8c16', wd: 6 },
          { title: `$${formattedNumber(openAmt)}`, description: `${openCount} open invoices / credits`, color: '#d9d9d9', wd: 6 },
          { title: `$${formattedNumber(paidAmt)}`, description: `${paidCount} recently paid`, color: '#52c41a', wd: 6 },
        ]);
      } catch (err) {
        if (mounted) setErrorMessage(err?.message || 'Failed to load summary');
      } finally {
        if (mounted) setCardsLoading(false);
      }
    };
    fetchCards();
    return () => { mounted = false; };
  }, []);

  const fetchSalesPage = useCallback(async (p = 1, size = PAGE_SIZE, searchTerm = '') => {
    setListLoading(true);
    try {
      const res = await window.electronAPI.getInvoicesPaginated(p, size, searchTerm);
      if (res && res.error) {
        setErrorMessage(res.error);
        setSalesData([]);
        setTotal(0);
        return;
      }
      const list = res?.data || [];
      setTotal(res?.total ?? 0);
      setPage(p);
      setPageSize(size);
      setSalesData(list.map((inv) => ({
        key: inv.id,
        date: inv.start_date,
        type: 'Invoice',
        no: inv.number,
        customer: inv.customer_name,
        memo: inv.message || '',
        amount: `$${formattedNumber(taxInclusiveAmount(inv.amount, inv.vat))}`,
        status: inv.status || '',
      })));
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to load sales');
      setSalesData([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalesPage(1, PAGE_SIZE, '');
  }, [fetchSalesPage]);

  const handleTableChange = (p, size) => { fetchSalesPage(p, size, search); };
  const handleSearch = (value) => { setSearch(value); fetchSalesPage(1, pageSize, value); };

  return (
    <Auxiliary> 
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Sales Transactions</h2>
   } 
   
   extra={
   <AddTransaction type="transaction"/>
   }>  
  {errorMessage ? (<Alert type="error" message={errorMessage} closable />) : null}
  <Row gutter={[16, 16]}>
        {cardsLoading ? (
          <Col span={24}><Spin tip="Loading summary..." /></Col>
        ) : (
          cards.map((item, index) => (
            <Col key={index} xs={24} sm={12} md={item.wd}>
              <Card bordered={false}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ProgressBar
                  percent={100}
                  showInfo={false}
                  strokeColor={item.color}
                  bgcolor={item.color}
                />
              </Card>
            </Col>
          ))
        )}
       <Col xs={24} sm={24} md={24}>
         <SalesList
           sales={salesData}
           loading={listLoading}
           total={total}
           page={page}
           pageSize={pageSize}
           onTableChange={handleTableChange}
           onSearch={handleSearch}
         />
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default AllSalesTab;
