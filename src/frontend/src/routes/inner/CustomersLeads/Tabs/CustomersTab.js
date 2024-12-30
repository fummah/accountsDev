import React, { useState, useEffect,useRef } from 'react';
import {Col, Row,Card, Progress,Alert, Button} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import styled from 'styled-components';
import { ArrowLeftOutlined } from '@ant-design/icons';
import CustomersList from "components/Inner/Customers/CustomersList";
import AddCustomer from 'components/Inner/Customers/AddCustomer';
import CustomerDetails from 'components/Inner/Customers/CustomerDetails';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';
import {CategoryContext} from "appContext/TypeContext.js";


const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};

const ProgressBar = styled(Progress)` 
  .ant-progress-inner {
    background-color: ${(props) => props.bgcolor};
  }
`;


const CustomersTab = () => {
  const addCustomerRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false);
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersSearched, setCustomersSearched] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [details, setDetails] = useState(0);
  const [report, setReport] = useState([]);
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    
    try {
      
      const title = userData.title;
      const first_name = userData.first_name;
      const middle_name = userData.middle_name;
      const last_name = userData.last_name;
      const suffix = userData.suffix;
      const email = userData.email;
      const display_name = userData.display_name;
      const company_name = userData.company_name;
      const phone_number = userData.phone_number;
      const mobile_number = userData.mobile_number;
      const fax = userData.fax;
      const other = userData.other;
      const website = userData.website;
      const address1 = userData.address1;
      const address2 = userData.address2;
      const city = userData.city;
      const state = userData.state;
      const postal_code = userData.postal_code;
      const country = userData.country;
      const payment_method = userData.payment_method;
      const terms = userData.terms;
      const notes = userData.notes;
      const tax_number = userData.tax_number;
      const entered_by = "1";
      const opening_balance = userData.opening_balance;
      const as_of = userData.as_of ? dayjs(userData.as_of).format('YYYY-MM-DD') : null;
      const delivery_option = userData.delivery_option;
      const language = userData.language;

      let result;
        
      if (userData.id) {
        const id = userData.id;
        const customerData = {id,title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
          fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes};
        result = await window.electronAPI.updateCustomer(customerData);   
      }
      else{
        result = await window.electronAPI.insertCustomer(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
          fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes);   
           } 
           
        
      setIsSuccess(result.success);
  
      if (result.success) {
        setMessage('Customer saved successfully!');
        fetchCustomers();
        if (addCustomerRef.current) {
          addCustomerRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to save customer. Please try again.');
        setShowError(true);
      }
    } catch (error) {
      setIsSuccess(false);      
      setMessage('An error occurred. Please try again later.');
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
      let result = await window.electronAPI.deleteRecord(id,"customers");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchCustomers();
      
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
  
    const fetchCustomers = async () => {
        try {
            const response = await await window.electronAPI.getAllCustomers();          
            setCustomers(response.all);
            setCustomersSearched(response.all);
            setReport([
              { 
                  title: `$${formattedNumber(response.report.due_quote[0].due_total_amount)}`, 
                  description: `${response.report.due_quote[0].due_quote} Estimates`, 
                  color: '#40a9ff', 
                  wd: 6 
              },
              { 
                  title: `$${formattedNumber(response.report.due_invoice[0].due_total_amount)}`, 
                  description: `${response.report.due_invoice[0].due_invoice} Overdue Invoices`, 
                  color: '#fa8c16', 
                  wd: 6 
              },
              { 
                  title: `$${formattedNumber(response.report.open_invoice[0].open_total_amount)}`, 
                  description: `${response.report.open_invoice[0].open_invoice} Open Invoices / Credits`, 
                  color: '#d9d9d9', 
                  wd: 6 
              },
              { 
                  title: `$${formattedNumber(response.report.paid_invoice[0].paid_total_amount)}`, 
                  description: `${response.report.paid_invoice[0].paid_invoice} Recently Paid`, 
                  color: '#52c41a', 
                  wd: 6 
              },
          ]);
          
        } catch (error) {
          setMessage("Error fetching customers:", error);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchCustomers();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedCustomer(null);
    setAddUserState(true);
  };

  const onBack = () =>{
    setSelectedCustomer(null);
    setDetails(0);
  }

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = customers.filter(
        (item) =>
          (item.first_name && item.first_name.toLowerCase().includes(value)) ||
        (item.middle_name && item.middle_name.toLowerCase().includes(value)) ||
        (item.last_name && item.last_name.toLowerCase().includes(value)) ||
        (item.company_name && item.company_name.toLowerCase().includes(value))
      );
      setCustomersSearched(filtered);
    }
    else{
      setCustomersSearched(customers);
    }
  };

  return (
    <CategoryContext.Provider value="Customer">
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
      {selectedCustomer && details?
       <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>
       Back
     </Button>
     :
     "Customers"
      }
       
       </h2>
   } 
   
   extra={
    <AddCustomer 
    user={selectedCustomer}
    type="customer" 
    open={addUserState} 
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addCustomerRef}
  />
   }>  
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
  <Row gutter={[16, 16]}>
  {selectedCustomer && details ? (
    <Col xs={24} sm={24} md={24}> 
       <CustomerDetails id={selectedCustomer} setMessage = {setMessage} setShowError = {setShowError}/>
       </Col>
      ) : 
        (
        <>
        {report.map((item, index) => (
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
        ))}
       
       <Col xs={24} sm={24} md={24}> 
          <CustomersList customers={customersSearched} onSelectCustomer={setSelectedCustomer} setAddUserState={setAddUserState} setDetails={setDetails} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
       </Col>
       </>
        )}
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
 </CategoryContext.Provider>
  );
};

export default CustomersTab;
