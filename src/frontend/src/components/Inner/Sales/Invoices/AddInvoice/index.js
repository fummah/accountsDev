import React, { useState,forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space,Dropdown,DatePicker, Checkbox } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";
import InvoiceTable from './InvoiceTable';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const AddInvoice = forwardRef(({ type,onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, item }, ref) => {

  const [lines, setLines] = useState([]);
  const [total, setTotal] = useState(0);
  const [vat, setVat] = useState([]);
  const [number, setNumber] = useState("----"); 
  const [vatRate, setVatRate] = useState(0);
  
    const [options, setOptions] = useState([
      { label: 'Cash', value: 'cash' },
      { label: 'Cheque', value: 'cheque' },
      { label: 'Credit Card', value: 'Credit Card' },
      { label: 'Direct Debit', value: 'Direct Debit' },
    ]);

    const [customers, setCustomers] = useState([      
      { name: 'Save', id: 907 },
    ]);

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
    const statuslist = type === "Quote"?[
      {label:"Pending",value:"Pending"},
  {label:"Rejected",value:"Rejected"},
  {label:"Cancelled",value:"Cancelled"},
  {label:"Invoiced",value:"Invoiced"}
    ]:[
  {label:"Pending",value:"Pending"},
  {label:"Rejected",value:"Rejected"},
  {label:"Paid",value:"Paid"},
  {label:"Partially Paid",value:"Partially Paid"},
  {label:"Cancelled",value:"Cancelled"}
    ];

    
    const [products, setProduct] = useState([]);

    const fetchInitials = async () => {
            
      const id = item?item.id : 0;
      try {        
          const response = await window.electronAPI.getInitialInvoice(id,type);       
          setCustomers(response.customers);
          setProduct(response.products);
          setLines(response.lines);
          setVat(response.vat);
          if(!item) {             
          setNumber(response.number);
          }
      } catch (error) {
        const errorMessage = error.message || "An unknown error occurred.";
    setMessage(`Error fetching invoices: ${errorMessage}`);
        setShowError(true);
      }
  };

  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };

  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(values => {
      if (item) {
        values.id = item.id;
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

    if (item) {
      setNumber(item.number); // Set the number for the existing item
      setVatRate(item.vat);
      form.setFieldsValue({
        ...item,
        islater: item.islater === "on",
        start_date: item.start_date ? dayjs(item.start_date) : null,
        last_date: item.last_date ? dayjs(item.last_date) : null,
      });
    } else {
      form.resetFields(); // Clear form for a new item
    }
  }; 

  initializeForm();
}, [item, form,]);


const handleSubtotalChange = (newSubtotal) => {
  setTotal(newSubtotal);
}
const handleVatChange = (value) => {
  setVatRate(value); // Update the VAT rate based on user selection
};
  const items = [
    {
      label: 'Import',
      key: '1',
    },    
  ];
  const handleFormChange = (changedValues) => {
    if (changedValues.number) {
      setNumber(changedValues.number); 
    }
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
        New {type}
      </Dropdown.Button>
       </p>
     
      <Drawer
        title={`${item ? 'Edit' : 'Add'} ${type}`}
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
      
  <Form form={form} layout="" {...layout} onValuesChange={handleFormChange}
   initialValues={{
    number: number,
    status: `Pending`,
    vat:0,
  }}
  >
  <Widget
  title = {
    <h1 className='h1 gx-text-primary gx-mb-0'> {type} No.#{number}</h1>
  }
  >
        
          <Row gutter={2}>  
                   
          <Col span={4}>
              <Form.Item
      name="status"
      label="Status"      
    >
      <Select mode="single" placeholder="Select status" rules={[{ required: true, message: 'Select status', },]}>   
         
        {statuslist.map((item, index) => (
          <Option key={index} value={item.value}>
            {item.label}
          </Option>
        ))}
        
      </Select>
    </Form.Item>
              </Col> 
                  
            <Col span={4}>
              <Form.Item name="customer" label="Customer" rules={[{ required: true, message: 'Select Customer', },]}>
              <Select placeholder="Select Customer">
      {customers.map((customer) => (
        <Option key={customer.id} value={customer.id}>
          {customer.name}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item name="customer_email" placeholder="Enter Customer Email" label="Customer Email" 
              rules={[{ required: true, message: 'Enter email', },{type: "email",message: "Please enter a valid email address!", },]}>
             <Input/>
              </Form.Item>
              </Col>
              <Col span={4}>
              <p></p>
              <Form.Item name="islater" valuePropName="checked" className='h5 gx-mb-0'>
              <Checkbox> Send Later</Checkbox>
              </Form.Item>
              </Col>
              {
              type === "Invoice" && (
               <Col span={4}></Col>
              )}
              <Col span={4}>
              <div style={{float:'right'}}>
              <p className='h4 gx-text-primary gx-mb-0'> { type === "Invoice"?"Balance Due":"Amount" }</p>
              <h1 className='h1 gx-text-primary gx-mb-0'> ${total}</h1>
              </div>
              </Col>           
              
              </Row>

              <Row gutter={16}>           
            <Col span={4}>
              <Form.Item name="billing_address" label="Billing Address" rules={[{ required: true, message: 'Enter billing address', },]}>
              <TextArea rows={4} />
              </Form.Item>
              </Col>
              { type === "Invoice" && (
     <Col span={4}>
     <Form.Item name="terms" label="Terms" rules={[{ required: true, message: 'Please select terms', },]}> 
<Select mode="single" placeholder="Please select terms" value="" defaultValue="Select term">
<Option value="Net15">Net15</Option>
<Option value="Net30">Net30</Option>
<Option value="Net60">Net60</Option>
</Select>
</Form.Item>
     </Col>
              )}
              <Col span={4}>
              <Form.Item name="start_date" label={`${type} Date`} rules={[{ required: true, message: 'Select Date', },]}>
              <DatePicker/>
              </Form.Item>
              </Col>
              <Col span={4}>
              <Form.Item name="last_date" label={type === "Invoice"?"Due Date":"Expiration date"}>
              <DatePicker/>
              </Form.Item>
              </Col>
              { type === "Quote" && (
                <Col span={4}></Col>
              )}
              <Col span={8}>
              <div style={{float:'right'}}>
              <Form.Item name="number" label={`${type} No.`} rules={[{ required: true, message: 'Required', },]}>
              <Input/>
              </Form.Item>
              </div>
              </Col> 
              </Row>
              
              <Row gutter={16}>           
            <Col span={24}>
              <InvoiceTable item={item} products={products} setLines={setLines} onSubtotalChange={handleSubtotalChange} vatRate={vatRate} initialLines ={lines}/>
              </Col>              
              
              </Row>   
              <Row gutter={16}> 
              <Col span={4}>
              <Form.Item name="vat" label="Vat">
              <Select defaultValue={0} onChange={handleVatChange}>
      {vat.map((va) => (
        <Option key={va.id} value={va.vat_percentage}>
          {va.vat_name}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>
              </Row>
              <Row gutter={16}> 
              <Col span={8}>
              <Form.Item name="message" label={`Message on ${type}`}>
              <TextArea rows={4} />
              </Form.Item>
              </Col>
                </Row>        
                <Row gutter={16}> 
                <Col span={8}>
              <Form.Item name="statement_message" label='Message on statement'>
              <TextArea rows={4} />
              </Form.Item>
              </Col>
                </Row> 
              </Widget>
              </Form>        
      </Drawer>
    </>
  );
});
export default AddInvoice;