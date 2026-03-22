import React,{useState, useEffect, useCallback}  from "react";
import {  Row, Col, Alert, Button, Spin } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import InvoicesCard from "components/dashboard/Home/InvoicesCard";
import InvoicesList from "components/Inner/Sales/Invoices/InvoicesList";
import InvoiceDetails from 'components/Inner/Sales/Invoices/InvoiceDetails';
import Toast from "components/AppNotification/toast.js";
import {TypeContext} from "appContext/TypeContext.js";

const PAGE_SIZE = 25;

const InvoicesTab = () => {
  const history = useHistory();
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [details, setDetails] = useState(0);
  const [report, setReport] = useState(null);
  const deleteRecord = async(id) => {

    const userConfirmed = window.confirm("Are you sure you want to delete this record?");
    if (!userConfirmed) {
      return; // Exit the function if the user cancels
    }
     
    try {     
      let result = await window.electronAPI.deleteRecord(id,"invoices");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchInvoices(page, pageSize, search);
      
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
  
  
    const fetchReport = useCallback(async () => {
      try {
        setReportLoading(true);
        const res = await window.electronAPI.getInvoiceReport();
        if (res && !res.error) setReport(res);
      } catch (e) {
        console.error('Error fetching invoice report:', e);
      } finally {
        setReportLoading(false);
      }
    }, []);

    const fetchInvoices = useCallback(async (p = page, size = pageSize, searchTerm = search, status = statusFilter) => {
        try {
            setLoading(true);
            const res = await window.electronAPI.getInvoicesPaginated(p, size, searchTerm, status || '');
            if (res && res.error) {
              setMessage(`Error fetching invoices: ${res.error}`);
              setShowError(true);
              return;
            }
            setInvoices(res.data || []);
            setTotal(res.total || 0);
            setPage(p);
            setPageSize(size);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
          setMessage(`Error fetching invoices: ${errorMessage}`);
          setShowError(true);
        } finally {
          setLoading(false);
        }
    }, [page, pageSize, search, statusFilter]);

    useEffect(() => {
      fetchReport();
    }, [fetchReport]);

    useEffect(() => {
      fetchInvoices(1, PAGE_SIZE, '');
    }, []);

    const handleTableChange = (p, size) => {
      fetchInvoices(p, size, search, statusFilter);
    };

    const handleSearch = (value) => {
      setSearch(value);
      fetchInvoices(1, pageSize, value, statusFilter);
    };

    const handleStatusFilterChange = (value) => {
      const v = value || '';
      setStatusFilter(v);
      fetchInvoices(1, pageSize, search, v);
    };

  const onBack = () =>{
    setSelectedInvoice(null);
    setDetails(0);
  }

  return (
    <TypeContext.Provider value="Invoice">
    <Auxiliary>   
       <Toast title="Error" message={message} setShowError={setShowError} show={showError} /> 
       {!details && (
        reportLoading ? <Spin tip="Loading report..." /> : <InvoicesCard title="" Report = {report}/>  
       )}
<Widget
   title={
    <h2 className="h2 gx-text-capitalize gx-mb-0">
    {selectedInvoice && details ?
     <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>
     Back
   </Button>
   :
   "Invoices"
    }
     
     </h2>
   } 
   
   extra={
    <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/invoices/new')}>
      New Invoice
    </Button>
   }>  
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} closable/>
        )
      } 
<Row gutter={[16, 16]}>     
{selectedInvoice && details ? (
   <Col xs={24} sm={24} md={24}> 
   <InvoiceDetails id={selectedInvoice}  setMessage = {setMessage} setShowError = {setShowError}/>
   </Col>
):(   
       <Col xs={24} sm={24} md={24}>
       <InvoicesList 
         dataList={invoices} 
         loading={loading} 
         total={total} 
         page={page} 
         pageSize={pageSize} 
         onTableChange={handleTableChange}
         onSearch={handleSearch}
         statusFilter={statusFilter}
         onStatusFilterChange={handleStatusFilterChange}
         onSelectInvoice={setSelectedInvoice} 
         setAddUserState={() => history.push('/main/customers/invoices/new')} 
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

export default InvoicesTab;
