import React, { useState, useEffect, useCallback } from "react";
import {  Row, Col, Alert, Button } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import InvoicesList from "components/Inner/Sales/Invoices/InvoicesList";
import InvoiceDetails from 'components/Inner/Sales/Invoices/InvoiceDetails';
import Toast from "components/AppNotification/toast.js";
import {TypeContext} from "appContext/TypeContext.js";

const PAGE_SIZE = 25;

const QuotesTab = () => {
  const history = useHistory();
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [details, setDetails] = useState(0);
  
  
    const fetchQuotes = useCallback(async (p = 1, size = PAGE_SIZE, searchTerm = '', status = statusFilter) => {
        try {
            setLoading(true);
            const res = await window.electronAPI.getQuotesPaginated(p, size, searchTerm, status || '');
            if (res && res.error) {
              setMessage(`Error fetching quotes: ${res.error}`);
              setShowError(true);
              return;
            }
            setQuotes(res.data || []);
            setTotal(res.total || 0);
            setPage(p);
            setPageSize(size);
        } catch (error) {
          setMessage("Error fetching quotes: " + (error.message || error));
          setShowError(true);
        } finally {
          setLoading(false);
        }
    }, [statusFilter]);

    const handleTableChange = (p, size) => { fetchQuotes(p, size, search, statusFilter); };
    const handleSearch = (value) => { setSearch(value); fetchQuotes(1, pageSize, value, statusFilter); };

    const handleStatusFilterChange = (value) => {
      const v = value || '';
      setStatusFilter(v);
      fetchQuotes(1, pageSize, search, v);
    };

    const onConvertToInvoice = async (quote_id) => {
 
      const userConfirmed = window.confirm("Are you sure you want to convert this quote to an invoice?");
      if (!userConfirmed) {
        return; // Exit the function if the user cancels
      }
      try { 
    
          const result = await window.electronAPI.convertToInvoice(quote_id);          
      if (result.success) {
        setIsSuccess(true);
            setMessage('Quote successfully converted!');
            fetchQuotes(page, pageSize, search); 
            setSelectedQuote(null);
            setDetails(0);      
          } else {
            setMessage('Failed to convert quote. Please try again.');
            setIsSuccess(false);
            setShowError(true);
          }
      } catch (error) {
        setMessage("Error converting to quote:", error);
        setIsSuccess(false);
        setShowError(true);
      }
    };
    const deleteRecord = async(id) => {

      const userConfirmed = window.confirm("Are you sure you want to delete this record?");
      if (!userConfirmed) {
        return; // Exit the function if the user cancels
      }
       
      try {     
        let result = await window.electronAPI.deleteRecord(id,"quotes");
          
        setIsSuccess(result.success);  
        if (result.success) {
        setMessage('Record deleted successfully!');
        fetchQuotes(page, pageSize, search);
        
        } else {
          setMessage('Failed to delete. Please try again.');
          setShowError(true);
        }
      } catch (error) {
        setIsSuccess(false);      
        setMessage('An error occurred. Please try again later.');
        setShowError(true);
      }
      
    };

    useEffect(() => {
      fetchQuotes(1, PAGE_SIZE, '');
    }, []);

  const onBack = () =>{
    setSelectedQuote(null);
    setDetails(0);
  }

  return (
    <TypeContext.Provider value="Quote">
    <Auxiliary>   
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} /> 
<Widget
   title={
    <h2 className="h2 gx-text-capitalize gx-mb-0">
    {selectedQuote && details ?
     <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>
     Back
   </Button>
   :
   "Quotes"
    }     
     </h2>
   } 
   
   extra={
    <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/quotes/new')}>
      New Quote
    </Button>
   }>
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} closable/>
        )
      }  
<Row gutter={[16, 16]}>        
     
       {selectedQuote && details ? (
   <Col xs={24} sm={24} md={24}> 
   <InvoiceDetails id={selectedQuote} setMessage = {setMessage} setShowError = {setShowError} onConvertToInvoice = {onConvertToInvoice}/>
   </Col>
):(   
       <Col xs={24} sm={24} md={24}>
       <InvoicesList 
         dataList={quotes} 
         loading={loading} 
         total={total} 
         page={page} 
         pageSize={pageSize} 
         onTableChange={handleTableChange} 
         onSearch={handleSearch}
         statusFilter={statusFilter}
         onStatusFilterChange={handleStatusFilterChange}
         onSelectInvoice={setSelectedQuote} 
         setAddUserState={() => history.push('/main/customers/quotes/new')} 
         setDetails={setDetails} 
         onDelete={deleteRecord}
       />
       </Col>
)}
      </Row> 
      </Widget>
 </Auxiliary>
 </TypeContext.Provider>
  );
};

export default QuotesTab;
