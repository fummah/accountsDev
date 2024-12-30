import React, { useState, useEffect,useRef } from 'react';
import {Col, Row,Card, Alert} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import VatList from "components/Inner/Vat/VatList";
import AddVat from 'components/Inner/Vat/AddVat';
import Toast from "components/AppNotification/toast.js";

const Vat = () => {
  const addVatRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false);
  const [user, setUser] = useState(null); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [vat, setVat] = useState([]);
  const [vatSearched, setVatSearched] = useState([]);
  const [selectedVat, setSelectedVat] = useState(null);
   
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    
    try {
      
      const vat_name = userData.vat_name;
      const vat_percentage = userData.vat_percentage;
      const entered_by = "1"; 
      let result;
        
      if(userData.id) {
        const id = userData.id;
        const vatData = {id,vat_name, vat_percentage, entered_by};
        result = await window.electronAPI.updateVat(vatData);   
      }
      else{
        result = await window.electronAPI.insertVat(vat_name, vat_percentage, entered_by);
          } 
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Vat added successfully!');
        fetchVat();
        if (addVatRef.current) {
          addVatRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to add vat. Please try again.');
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
      let result = await window.electronAPI.deleteRecord(id,"vat");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchVat();
      
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
  
    const fetchVat = async () => {
        try {
            const response = await await window.electronAPI.getAllVat();          
            setVat(response);
            setVatSearched(response);

        } catch (error) {
          setMessage("Error fetching vat:", error);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchVat();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedVat(null);
    setAddUserState(true);
  };

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = vat.filter(
        (item) =>
          (item.vat_name && item.vat_name.toLowerCase().includes(value)) ||
        (item.vat_percentage && item.vat_percentage.toString().includes(value))
      );
      setVatSearched(filtered);
    }
    else{
      setVatSearched(vat);
    }
  };
  
  return (
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Vat List</h2>
   } 
   
   extra={
    <AddVat 
    open={addUserState} 
    vat={selectedVat}
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addVatRef}
  />
   }>  
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
  <Row gutter={[16, 16]}>
          
       <Col xs={24} sm={24} md={24}>
       <VatList vat={vatSearched} onSelectVat={setSelectedVat} setAddUserState={setAddUserState} handleSearch={handleSearchedTxt} onDelete={deleteRecord}/>
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default Vat;
