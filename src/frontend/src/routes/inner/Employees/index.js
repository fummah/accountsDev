import React, { useState, useEffect, useRef, useCallback } from 'react';
import {Col, Row,Card, Alert} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import EmployeesList from "components/Inner/Employees/EmployeesList";
import AddEmployee from 'components/Inner/Employees/AddEmployee';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';

const PAGE_SIZE = 25;

const Employees = () => {
  const addEmployeeRef = useRef();
  const [addUserState, setAddUserState] = useState(false);
  const [user, setUser] = useState(null); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const totalSalary = employees.reduce((sum, employee) => sum + employee.salary, 0);
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    
    try {
      
      const first_name = userData.first_name;
      const last_name = userData.last_name;
      const mi = userData.mi;
      const email = userData.email;
      const phone = userData.phone;
      const address = userData.address;
      const entered_by = "1";  
      const status = userData.status;
      const salary = userData.salary;    
      const date_hired = userData.date_hired ? dayjs(userData.date_hired).format('YYYY-MM-DD') : null;

      const employeeData = { first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status };
      let result;
      if (userData.id) {
        result = await window.electronAPI.updateEmployee({ ...employeeData, id: userData.id });
      } else {
        result = await window.electronAPI.insertEmployee(employeeData);
      }
            console.log(result.message);
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Employee saved successfully!');
        fetchEmployees(page, pageSize, search);
        if (addEmployeeRef.current) {
          addEmployeeRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to save employee. Please try again.');
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
      let result = await window.electronAPI.deleteRecord(id,"employees");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchEmployees(page, pageSize, search);
      
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
  
    const fetchEmployees = useCallback(async (p = 1, size = PAGE_SIZE, searchTerm = '') => {
        try {
            setLoading(true);
            const res = await window.electronAPI.getEmployeesPaginated(p, size, searchTerm);
            if (res && res.error) {
              setMessage(`Error fetching employees: ${res.error}`);
              setShowError(true);
              return;
            }
            setEmployees(res.data || []);
            setTotal(res.total || 0);
            setPage(p);
            setPageSize(size);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
          setMessage(`Error fetching employees: ${errorMessage}`);
          setShowError(true);
        } finally {
          setLoading(false);
        }
    }, []);

    useEffect(() => {
      fetchEmployees(1, PAGE_SIZE, '');
    }, [fetchEmployees]);

    const handleTableChange = (p, size) => {
      fetchEmployees(p, size, search);
    };

    const handleSearch = (value) => {
      setSearch(value);
      fetchEmployees(1, pageSize, value);
    };

  const handleUserClose = () => {
    setAddUserState(false);
    setSelectedEmployee(null); // Clear selected employee when closing
  };
  
  const showDrawer = () => {
    setSelectedEmployee(null);
    setAddUserState(true);
    if (addEmployeeRef.current) {
      addEmployeeRef.current.resetForm();
    }
  };

  return (
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
    <Widget
   title={
     <h2 className="h2 gx-text-capitalize gx-mb-0">
       Employees</h2>
   } 
   
   extra={
    <AddEmployee 
    open={addUserState} 
    employee={selectedEmployee}
    onSaveUser={onSaveUser} // Pass the function
    onUserClose={handleUserClose} 
    showDrawer={showDrawer}
    setShowError={setShowError}
    setMessage={setMessage}
    ref={addEmployeeRef}
  />
   }>  
       {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} />
        )
      }
      <Row>
            <Col span={24}>
            <div style={{ marginTop: '20px' }}>
            <h2>Payroll Summary</h2>
            <p><strong>Total Employees:</strong> {employees.length}</p>
            <p><strong>Total Salary Expense:</strong> ${totalSalary.toLocaleString()}</p>
          </div>
       
              </Col>
                    
            </Row><hr/>
  <Row gutter={[16, 16]}>
          
       <Col xs={24} sm={24} md={24}>
       <EmployeesList
         employees={employees}
         loading={loading}
         total={total}
         page={page}
         pageSize={pageSize}
         onTableChange={handleTableChange}
         onSearch={handleSearch}
         onSelectEmployee={setSelectedEmployee}
         setAddUserState={setAddUserState}
         onDelete={deleteRecord}
       />
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default Employees;
