import React,{useRef, useState, useEffect} from "react";
import {  Row, Col,Alert,Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import InvoicesList from "components/Inner/Sales/Invoices/InvoicesList";
import AddInvoice from 'components/Inner/Sales/Invoices/AddInvoice';
import InvoiceDetails from 'components/Inner/Sales/Invoices/InvoiceDetails';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';
import {TypeContext} from "appContext/TypeContext.js";

  const QuotesTab = () => {
  const addQuoteRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [quotesSearched, setQuotesSearched] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [details, setDetails] = useState(0);
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    console.log(userData);
    try {
           
      const status = userData.status;
      const customer = userData.customer;
      const customer_email = userData.customer_email;
      const islater = userData.islater ? "1" : "0";
      const billing_address = userData.billing_address;
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
        const quoteData = {id,status,customer, customer_email, islater, billing_address, entered_by, start_date, last_date,last_date, last_date, message, statement_message, number, vat, lines};
        result = await window.electronAPI.updateQuote(quoteData);   
      }
      else{
        result = await window.electronAPI.insertQuote(status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat, lines);  
           }         
        setIsSuccess(result.success);
  
      if (result.success) {
        setMessage('Quote saved successfully!');
        fetchQuotes();
        if (addQuoteRef.current) {
          addQuoteRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to save quote. Please try again.');
        setShowError(true);
      }
        
        
    } catch (error) {
      setIsSuccess(false);      
      setMessage('An error occurred. Please try again later.');
      setShowError(true);
      console.log(error);
    }
    
  };
  
    const fetchQuotes = async () => {
        try {
            const response = await await window.electronAPI.getAllQuotes();          
            setQuotes(response);
            setQuotesSearched(response);
        } catch (error) {
          setMessage("Error fetching quotes:", error);
          setShowError(true);
        }
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
            fetchQuotes(); 
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
          fetchQuotes();
        
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
      fetchQuotes();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedQuote(null);
    setAddUserState(true);
  };
  const onBack = () =>{
    setSelectedQuote(null);
    setDetails(0);
  }

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = quotes.filter(
        (item) =>
          (item.customer_name && item.customer_name.toLowerCase().includes(value)) ||
        (item.number && item.number.toLowerCase().includes(value)) 
      );
      setQuotesSearched(filtered);
    }
    else{
      setQuotesSearched(quotes);
    }
  };
 
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
    <AddInvoice 
    type="Quote"
    item={selectedQuote}
    open={addUserState} 
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addQuoteRef}
  />
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
       <InvoicesList dataList={quotesSearched} onSelectInvoice={setSelectedQuote} setAddUserState={setAddUserState} setDetails={setDetails} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
       </Col>
)}
      </Row> 
      </Widget>
 </Auxiliary>
 </TypeContext.Provider>
  );
};

export default QuotesTab;
