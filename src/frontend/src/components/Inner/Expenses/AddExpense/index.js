import React, { useState,forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space,Dropdown,DatePicker } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";
import ExpenseTable from './ExpenseTable';
import dayjs from 'dayjs';

const { Option } = Select;

const AddExpense = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, expense }, ref) => {  
  const [lines, setLines] = useState([]);
    const [options, setOptions] = useState([
      { label: 'Cash', value: 'cash' },
      { label: 'Cheque', value: 'cheque' },
      { label: 'Credit Card', value: 'Credit Card' },
      { label: 'Direct Debit', value: 'Direct Debit' },
    ]);
    const [total, setTotal] = useState(0);

    const [payees, setPayees] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [employees, setEmployees] = useState([]);

    const [paymentMethods, setPaymentMethods] = useState([
      { label: 'Accrued liabilities', value: 'Accrued liabilities' },
      { label: 'Cash and cash equivalents', value: 'Cash and cash equivalents' },
      { label: 'Allowance for bad debt', value: 'Allowance for bad debt' },
      { label: 'Available for sale assets (short-term)', value: 'Available for sale assets (short-term)' },
      { label: 'Prepaid expenses', value: 'Prepaid expenses' },
      { label: 'Stock', value: 'Stock' },
      { label: 'Stock Asset', value: 'Stock Asset' },
      { label: 'Uncategorised Asset', value: 'Uncategorised Asset' },
      { label: 'Undeposited Funds', value: 'Undeposited Funds' },
    ]);

    
    const [cats, setCats] = useState([
      { label: 'Amortisation expense', value: 'Amortisation expense' },
      { label: 'Bad debts', value: 'Bad debts' },
      { label: 'Bank charges', value: 'Bank charges' },
      { label: 'Commissions and fees', value: 'Commissions and fees' },
      { label: 'Dues and subscriptions', value: 'Dues and subscriptions' },
      { label: 'Equipment rental', value: 'Equipment rental' },
      { label: 'Income tax expense', value: 'Income tax expense' },
      { label: 'Insurance - Disability', value: 'Insurance - Disability' },
      { label: 'Insurance - General', value: 'Insurance - General' },
      { label: 'Insurance - Liability', value: 'Insurance - Liability' },
      { label: 'Interest expense', value: 'Interest expense' },
      { label: 'Legal and professional fees', value: 'Legal and professional fees' },
      { label: 'Loss on discontinued operations, net of tax', value: 'Loss on discontinued operations, net of tax' },
    ]);

    const fetchInitials = async () => {
            
      try {  
        const id = expense?expense.id : 0;
        const xcategory = expense?expense.category : "customer";       
          const response = await window.electronAPI.getInitialInvoice(id,'expense');
         
          setLines(response.lines);
          setCustomers(response.customers);  
          setSuppliers(response.suppliers); 
          setEmployees(response.employees);   
          
          if (xcategory === "customer") {
            setPayees(response.customers);
          } else if (xcategory === "supplier") {
            setPayees(response.suppliers);
          } else if (xcategory === "employee") {
            setPayees(response.employees);
          }
          
      } catch (error) {
        const errorMessage = error.message || "An unknown error occurred.";
    setMessage(`Error fetching invoices: ${errorMessage}`);
        setShowError(true);
      }
  };

    const handleAddNew = () => {
      console.log("Add new payment method");
    };

  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };

  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if (expense) {
        values.id = expense.id;
      }
      const alldata = {...values, lines:lines};
      onSaveUser(alldata); 
    }).catch(info => {
      setMessage('Please complete the fields');
      setShowError(true);     
      console.log('Validate Failed:', info);
         
    });
  };
  useImperativeHandle(ref, () => ({
    resetForm() {
        form.resetFields();
    }
}));


useEffect(() => {
  const initializeForm = async () => {
    await fetchInitials(); // Fetch initial data

    if (expense) {
      form.setFieldsValue({
        ...expense,
        payment_date: expense.payment_date ? dayjs(expense.payment_date) : null,
      });
    } else {
      form.resetFields(); // Clear form for a new item
    }
  }; 

  initializeForm();
}, [expense, form,]);

  const items = [ { label: 'Expense',  key: '1', },
   
  ];
  const handleSubtotalChange = (newSubtotal) => {
    setTotal(newSubtotal);
  }
  const handleCategoryChange = (selectedCategory) => {
    switch (selectedCategory) {
      case "supplier":
        setPayees(suppliers); // Update with suppliers
        break;
      case "customer":
        setPayees(customers); // Update with customers
        break;
      case "employee":
        setPayees(employees); // Update with employees
        break;
      default:
        setPayees([]); // Clear payees for an unknown category
    }

    console.log(selectedCategory);
    console.log(payees);
  };
  
  return (

    <>
       <p className={`gx-text-primary gx-mb-0 gx-pointer gx-d-none gx-d-sm-block`} onClick={showDrawer}>
       <Dropdown.Button
       type="primary"
        icon={<DownOutlined />}
        menu={{
          items,
        }}
        onClick={() => {}}
      >
        New Transaction
      </Dropdown.Button>
       </p>
     
      <Drawer
        title={`${expense ? 'Edit' : 'Add'} Expense`}
        size='large'
        placement='top'
        onClose={onUserClose}
        onCancel={onUserClose}
        open={open}
        style={{width:'100% !important'}}
        footer={
          <div
            style={{
              textAlign: 'right',
            }}
          >
                  <Row>
        <Col span={12}>
        <Space>
        <Button onClick={handleSave} type="primary">
              Save Details
            </Button>
            <Button onClick={onUserClose}>Cancel</Button>
          
          </Space>
        </Col>
      </Row>
          </div>
        }
      >
      
  <Form form={form} layout="" {...layout}>
  <Widget    
      >
        
          <Row gutter={2}>   
          <Col span={4}>
              <Form.Item
      name="category"
      label="Category"      
    >
      <Select mode="single" placeholder="Please select category" rules={[{ required: true, message: 'Select Category', },]}
      onChange={(value) => handleCategoryChange(value)}
      >
        <Option value="supplier">Supplier</Option>
        <Option value="customer">Customer</Option>
        <Option value="employee">Employee</Option>
      </Select>
    </Form.Item>
              </Col>        
            <Col span={4}>
              <Form.Item name="payee" label="Payee" rules={[{ required: true, message: 'Select Payee', },]}>
              <Select placeholder="Select Payee">
      {payees.map((payee) => (
        <Option key={payee.id} value={payee.id}>
          {payee.name}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item name="payment_account" label="Payment Account" rules={[{ required: true, message: 'Select Payment Account', },]}>
              <Select placeholder="Select Payment account">       
      {paymentMethods.map((paymentMethod) => (
        <Option key={paymentMethod.value} value={paymentMethod.value}>
          {paymentMethod.label}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>
              <Col span={4}>
              <p></p>
              </Col>
              <Col span={8}>
              <div style={{float:'right'}}>
              <p className='h4 gx-text-primary gx-mb-0'> Amount</p>
              <h1 className='h1 gx-text-primary gx-mb-0'> ${total}</h1>
              </div>
              </Col>           
              
              </Row>

              <Row gutter={16}>           
            <Col span={4}>
              <Form.Item name="payment_date" label="Payment Date" rules={[{ required: true, message: 'Payment Date', },]}>
                   <DatePicker/> 
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item name="payment_method" label="Payment Method" rules={[{ required: true, message: 'Payment Method', },]}>
              <Select placeholder="Select Payment method">
      {options.map((option) => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item name="ref_no" label="Ref No." rules={[{ required: true, message: 'Ref No.', },]}>
                   <Input /> 
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item
      name="approval_status"
      label="Status"      
    >
      <Select mode="single" placeholder="Select status" value="Pending" defaultValue={`Pending`} rules={[{ required: true, message: 'Select status', },]}>
        <Option value="Pending">Pending</Option>
        <Option value="Accepted">Paid</Option>
        <Option value="Rejected">Rejected</Option>
      </Select>
    </Form.Item>
              </Col>
              </Row>

              <Row gutter={16}>           
            <Col span={24}>
              <ExpenseTable cats={cats} setLines={setLines} onSubtotalChange={handleSubtotalChange} initialLines ={lines}/>
              </Col>
              </Row>           
        
              </Widget>
              </Form>        
      </Drawer>
    </>
  );
});
export default AddExpense;