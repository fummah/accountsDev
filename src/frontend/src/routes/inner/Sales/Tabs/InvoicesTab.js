import React,{useRef, useState, useEffect}  from "react";
import {  Row, Col, Alert, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import InvoicesCard from "components/dashboard/Home/InvoicesCard";
import InvoicesList from "components/Inner/Sales/Invoices/InvoicesList";
import AddInvoice from 'components/Inner/Sales/Invoices/AddInvoice';
import InvoiceDetails from 'components/Inner/Sales/Invoices/InvoiceDetails';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';
import {TypeContext} from "appContext/TypeContext.js";


const InvoicesTab = () => {
  const addInvoiceRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesSearched, setInvoicesSearched] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [details, setDetails] = useState(0);
  const [report, setReport] = useState(null);
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    console.log(userData);
    try {
      const status = userData.status;
      const customer = userData.customer;
      const customer_email = userData.customer_email;
      const islater = userData.islater ? "1" : "0";
      const billing_address = userData.billing_address;
      const terms = userData.terms;
      const entered_by = "1";
      const start_date = userData.start_date ? dayjs(userData.start_date).format('YYYY-MM-DD') : null;
      const last_date = userData.last_date ? dayjs(userData.last_date).format('YYYY-MM-DD') : null;
      const message = userData.message;
      const statement_message = userData.statement_message;
      const number = userData.number;
      const vat = userData.vat;
      const lines = userData.lines;
      let result;
        
      if (userData.id) {
        const id = userData.id;
        const invoiceData = {id,status,customer, customer_email, islater, billing_address, terms, entered_by, start_date, last_date,last_date, last_date, message, statement_message, number, vat, lines};
        result = await window.electronAPI.updateInvoice(invoiceData);   
      }
      else{
        result = await window.electronAPI.insertInvoice(customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by, vat, status, lines);  
           }         
       setIsSuccess(result.success);
  
      if (result.success) {
        setMessage('Invoice saved successfully!');
        fetchInvoices();
        if (addInvoiceRef.current) {
          addInvoiceRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage(`Failed to save invoice. Please try again. ${result.error}`);
        setShowError(true);
      }       
        
    } catch (error) {
      setIsSuccess(false);  
      const errorMessage = error.message || "An unknown error occurred.";    
      setMessage(`An error occurred. Please try again later. ${errorMessage}`);
      setShowError(true);
      console.log(error);
    }
    
  };
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
        fetchInvoices();
      
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
  
  
    const fetchInvoices = async () => {
        try {
            const response = await await window.electronAPI.getAllInvoices();          
            setInvoices(response.all);
            setReport(response.report);
            setInvoicesSearched(response.all);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
    setMessage(`Error fetching invoices: ${errorMessage}`);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchInvoices();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedInvoice(null);
    setAddUserState(true);
  };
  const onBack = () =>{
    setSelectedInvoice(null);
    setDetails(0);
  }

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = invoices.filter(
        (item) =>
          (item.customer_name && item.customer_name.toLowerCase().includes(value)) ||
        (item.number && item.number.toLowerCase().includes(value)) 
      );
      setInvoicesSearched(filtered);
    }
    else{
      setInvoicesSearched(invoices);
    }
  };
  return (
    <TypeContext.Provider value="Invoice">
    <Auxiliary>   
       <Toast title="Error" message={message} setShowError={setShowError} show={showError} /> 
       {!details && (
<InvoicesCard title="" Report = {report}/>  
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
    <AddInvoice 
    type="Invoice"
    item={selectedInvoice}
    open={addUserState} 
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addInvoiceRef}
  />
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
       <InvoicesList dataList={invoicesSearched} onSelectInvoice={setSelectedInvoice} setAddUserState={setAddUserState} setDetails={setDetails} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
       </Col>
)}
      </Row> 
      </Widget>
 </Auxiliary>
 </TypeContext.Provider>
  );
};

export default InvoicesTab;
