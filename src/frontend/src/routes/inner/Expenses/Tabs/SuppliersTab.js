import React, { useState, useEffect,useRef } from 'react';
import {Col, Row, Alert, Button} from "antd";
import { ArrowLeftOutlined } from '@ant-design/icons';
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import AddSupplier from 'components/Inner/Customers/AddCustomer';
import SuppliersList from "components/Inner/Expenses/SuppliersList";
import SupplierDetails from 'components/Inner/Customers/CustomerDetails';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';
import {CategoryContext} from "appContext/TypeContext.js";

const SuppliersTab = () => {
  const addSupplierRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false);
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersSearched, setSuppliersSearched] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [details, setDetails] = useState(0);

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
      const supplier_terms = userData.supplier_terms;
      const business_number = userData.business_number;
      const account_number = userData.account_number;
      const expense_category = userData.expense_category;
      const entered_by = "1";
      const opening_balance = userData.opening_balance;
      const as_of = userData.as_of ? dayjs(userData.as_of).format('YYYY-MM-DD') : null;
      
      let result;
        
      if (userData.id) {
        const id = userData.id;
        const supplierData = {id,title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
          fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by};
        result = await window.electronAPI.updateSupplier(supplierData);   
      }
      else{
        result = await window.electronAPI.insertSupplier(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
          fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by
        );  
       } 
      setIsSuccess(result.success);    
      if (result.success) {
        setMessage('Supplier saved successfully!');
        fetchSuppliers();
        if (addSupplierRef.current) {
          addSupplierRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to save supplier. Please try again.');
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
      let result = await window.electronAPI.deleteRecord(id,"suppliers");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchSuppliers();
      
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
  
    const fetchSuppliers = async () => {
        try {
            const response = await await window.electronAPI.getAllSuppliers();          
            setSuppliers(response);
            setSuppliersSearched(response);
        } catch (error) {
          setMessage("Error fetching suppliers:", error);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchSuppliers();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedSupplier(null);
    setAddUserState(true);
  };

  const onBack = () =>{
    setSelectedSupplier(null);
    setDetails(0);
  }
 
  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = suppliers.filter(
        (item) =>
          (item.first_name && item.first_name.toLowerCase().includes(value)) ||
        (item.middle_name && item.middle_name.toLowerCase().includes(value)) ||
        (item.last_name && item.last_name.toLowerCase().includes(value)) ||
        (item.company_name && item.company_name.toLowerCase().includes(value))
      );
      setSuppliersSearched(filtered);
    }
    else{
      setSuppliersSearched(suppliers);
    }
  };
  return (
    <CategoryContext.Provider value="Supplier">
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
    <h2 className="h2 gx-text-capitalize gx-mb-0">
    {selectedSupplier && details ?
     <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>
     Back
   </Button>
   :
   "Suppliers"
    }
     
     </h2>
   }  extra={
    <AddSupplier 
    type="supplier" 
    open={addUserState} 
    user={selectedSupplier} 
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addSupplierRef}
  />
    }>  
    {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
   <Row>
   {selectedSupplier && details ? (
      <Col xs={24} sm={24} md={24}> 
      <SupplierDetails id={selectedSupplier} setMessage = {setMessage} setShowError = {setShowError}/>
      </Col>
   ):(
   <Col span={24}>
   <SuppliersList suppliers={suppliersSearched} onSelectSupplier={setSelectedSupplier} setDetails={setDetails} setAddUserState={setAddUserState} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
     </Col>
   )}
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
 </CategoryContext.Provider>
  );
};

export default SuppliersTab;
