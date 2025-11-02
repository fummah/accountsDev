import React, { useState, useEffect,useRef } from 'react';
import {Col, Row,Card, Alert} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import EmployeesList from "components/Inner/Employees/EmployeesList";
import AddEmployee from 'components/Inner/Employees/AddEmployee';
import Toast from "components/AppNotification/toast.js";
import dayjs from 'dayjs';

const data = [
  {
    id: 1,
    name: 'John Doe',
    position: 'Software Engineer',
    salary: 6000,
  },
  {
    id: 2,
    name: 'Jane Smith',
    position: 'Project Manager',
    salary: 8000,
  },
  {
    id: 3,
    name: 'Alice Johnson',
    position: 'Designer',
    salary: 5000,
  },
];



const Employees = () => {
  const addEmployeeRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false);
  const [user, setUser] = useState(null); 
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesSearched, setEmployeesSearched] = useState([]);
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

      let result;
        
      if (userData.id) {
        const id = userData.id;
        const employeeData = {id,first_name, last_name, mi, email,phone,address, date_hired, entered_by, salary, status};
        result = await window.electronAPI.updateEmployee(employeeData);   
      }
      else{
        result = await window.electronAPI.insertEmployee(first_name, last_name, mi, email,phone,address, date_hired, entered_by, salary, status); 
          }
            console.log(result.message);
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Employee saved successfully!');
        fetchEmployees();
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
        fetchEmployees();
      
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
  
    const fetchEmployees = async () => {
        try {
            const response = await await window.electronAPI.getAllEmployees();          
            setEmployees(response);
            setEmployeesSearched(response);
        } catch (error) {
          const errorMessage = error.message || "An unknown error occurred.";
          setMessage(`Error fetching employees: ${errorMessage}`);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchEmployees();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedEmployee(null);
    setAddUserState(true);
  };

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = employees.filter(
        (item) =>
          (item.first_name && item.first_name.toLowerCase().includes(value)) ||
        (item.mi && item.mi.toLowerCase().includes(value))  ||
        (item.last_name && item.last_name.toLowerCase().includes(value)) 
      );
      setEmployeesSearched(filtered);
    }
    else{
      setEmployeesSearched(employees);
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
       <EmployeesList employees={employeesSearched} onSelectEmployee={setSelectedEmployee} setAddUserState={setAddUserState} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
       </Col>
      </Row>
  <hr/>
   
   </Widget>
 </Auxiliary>
  );
};

export default Employees;
