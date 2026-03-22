import React, { useRef, useState, useEffect, useCallback } from "react";
import { Col, Row, Alert } from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import AddExpense from 'components/Inner/Expenses/AddExpense';
import ExpensesList from "components/Inner/Expenses/ExpensesList";
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';


const PAGE_SIZE = 25;

const ExpensesTab = () => {
  const addExpenseRef = useRef();
  const [addUserState, setAddUserState] = useState(false); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);

  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    console.log(userData);
    try {
           
      const payee = userData.payee;
      const payment_account = userData.payment_account;
      const ref_no = userData.ref_no;
      const category = userData.category;
      const payment_method = userData.payment_method;
      const approval_status = userData.approval_status;
      const entered_by = "1";
      const payment_date = userData.payment_date ? dayjs(userData.payment_date).format('YYYY-MM-DD') : null;
      const lines = userData.lines;
      
      let result;
        
      if (userData.id) {
        const id = userData.id;
        const expenseData = {id,payee,payment_account, ref_no, category, payment_method, entered_by, payment_date, approval_status, lines};
        result = await window.electronAPI.updateExpense(expenseData);   
      }
      else{
        result = await window.electronAPI.insertExpense(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,lines);    
           } 
      setIsSuccess(result.success);
  
      if (result.success) {
        setMessage('Expense saved successfully!');
        fetchExpenses(page, pageSize, search);
        if (addExpenseRef.current) {
          addExpenseRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to saved expense. Please try again.');
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
      let result = await window.electronAPI.deleteRecord(id,"expenses");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchExpenses(page, pageSize, search);
      
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
  
    const fetchExpenses = useCallback(async (p = 1, size = PAGE_SIZE, searchTerm = '') => {
        try {
            setLoading(true);
            const res = await window.electronAPI.getExpensesPaginated(p, size, searchTerm);
            if (res && res.error) { setMessage("Error fetching expenses: " + res.error); setShowError(true); return; }
            setExpenses(res.data || []);
            setTotal(res.total || 0);
            setPage(p);
            setPageSize(size);
        } catch (error) {
          setMessage("Error fetching expenses: " + (error.message || error));
          setShowError(true);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchExpenses(1, PAGE_SIZE, ''); }, []);

    const handleTableChange = (p, size) => { fetchExpenses(p, size, search); };
    const handleSearch = (value) => { setSearch(value); fetchExpenses(1, pageSize, value); };

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedExpense(null);
    setAddUserState(true);
  };

 
  return (
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Expenses</h2>
   }
   extra={
   <AddExpense
   expense={selectedExpense} 
   open={addUserState} 
   onSaveUser={onSaveUser} // Pass the function
   onUserClose={handleUserClose} 
   showDrawer={showDrawer}
   setShowError={setShowError}
   setMessage={setMessage}
   ref={addExpenseRef}
 />
   } >  
    {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} closable/>
        )
      }
   <Row>
   <Col span={24}>
<ExpensesList expenses={expenses} loading={loading} total={total} page={page} pageSize={pageSize} onTableChange={handleTableChange} onSearch={handleSearch} onSelectExpense={setSelectedExpense} setAddUserState={setAddUserState} setDetails={() => {}} onDelete={deleteRecord}/>

     </Col>
           
   </Row><hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default ExpensesTab;
