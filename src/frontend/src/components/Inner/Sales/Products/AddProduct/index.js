import React, { useState,forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button, Col, Select, Drawer, Form, Input, Row, Space, Dropdown, Checkbox, Divider, Modal, InputNumber } from 'antd';
import { DownOutlined, IdcardOutlined, PlusOutlined } from '@ant-design/icons';
import Widget from "components/Widget/index";

const { Option } = Select;
const { TextArea } = Input;

const AddProduct = forwardRef(({ onSaveUser, onUserClose, showDrawer, open, setShowError,setMessage, product }, ref) => {
  
  const [form] = Form.useForm();
  const [incomeAccounts, setIncomeAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm] = Form.useForm();

  const loadCategories = async () => {
    try {
      const c = await window.electronAPI.getProductCategories?.();
      setCategories(Array.isArray(c) ? c : []);
    } catch {}
  };

  useEffect(() => {
    const fetchIncomeAccounts = async () => {
      try {
        const accs = await window.electronAPI.getChartOfAccounts();
        const list = Array.isArray(accs) ? accs : (accs?.data || []);
        const incomeOnly = list.filter(a => {
          const t = (a.accountType || a.type || '').toLowerCase();
          return t.includes('income') || t.includes('revenue');
        });
        setIncomeAccounts(incomeOnly);
      } catch (e) {
        console.error('Failed to load income accounts:', e);
      }
    };
    if (open) { fetchIncomeAccounts(); loadCategories(); }
  }, [open]);

  const handleSave = () => {
    form.validateFields().then(values => {
      if (product) {
        values.id = product.id;
      }
      onSaveUser(values); 
    }).catch(info => {
      setMessage('Please complete the fields');
      setShowError(true);     
      console.log('Validate Failed:', info);
         
    });
  };

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.insertProductCategory?.(vals.cat_name);
      if (res?.error) { setMessage(res.error); setShowError(true); return; }
      setCatModalOpen(false);
      catForm.resetFields();
      loadCategories();
    } catch (e) { if (!e?.errorFields) { setMessage('Failed to add category'); setShowError(true); } }
  };

  useImperativeHandle(ref, () => ({
    resetForm() {
        form.resetFields();
    }
}));

useEffect(() => {
  if (product) {
    form.setFieldsValue(product); // Prepopulate form fields if editing
  } else {
    form.resetFields(); // Clear form for adding a new product
  }
}, [product, form]);


  const layout = {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  };
  const items = [
    {
      label: 'Import product / service',
      key: '1',
    },
  ];
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
        New Product / Service
      </Dropdown.Button>
       </p>
     
      <Drawer
        title='Product/Service information'
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
        <Col span={24}>
     <Form.Item name="type" label="Select Type" rules={[{ required: true, message: 'Please select type', },]}> 
<Select mode="single" placeholder="Please select type">
<Option value="Product">Product</Option>
<Option value="Service">Service</Option>
<Option value="Raw Material">Raw Material</Option>
<Option value="Asset">Asset</Option>
<Option value="Bundle">Bundle</Option>
</Select>
</Form.Item>
     </Col>
        </Row>

          <Row gutter={2}>           
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter name', },]}>
                   <Input placeholder="Enter name"/> 
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="sku" label="SKU">
                   <Input placeholder="Enter SKU"/> 
              </Form.Item>
              </Col>
              <Col span={24}>
              <Form.Item name="category" label="Category">
              <Select mode="single" placeholder="Enter category"
                dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                {categories.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
              </Select>
              </Form.Item>
              </Col>
                      
              <Col span={24}>
              <Form.Item name="description" label="Description">
              <TextArea rows={4} placeholder="Enter description"/> 
              </Form.Item>
              </Col>

              <Col span={12}>
              <Form.Item name="price" label="Sales price/rate">
              <Input placeholder="Enter sales price / rate"/>
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="stock" label="Stock Qty">
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
              </Form.Item>
              </Col>
              <Col span={12}>
              <Form.Item name="income_account" label="Income Account" rules={[{ required: true, message: 'Select Income Account', },]}>
              <Select placeholder="Select Income account" showSearch optionFilterProp="children">       
      {incomeAccounts.map((acc) => (
        <Option key={acc.id} value={acc.accountName || acc.name}>
          {acc.accountName || acc.name}{acc.accountNumber ? ` (${acc.accountNumber})` : ''}
        </Option>
      ))}
    </Select>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="tax_inclusive">
              <span className='h5 gx-mb-0'><Checkbox> Inclusive of tax</Checkbox> </span>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="tax" label="Tax">
              <Input/>
              </Form.Item>
              </Col>

              <Col span={24}>
              <Form.Item name="isfromsupplier" label="Purchasing information">
              <span className='h5 gx-mb-0'><Checkbox> I purchase this product/service from a supplier.</Checkbox> </span>
              </Form.Item>
              </Col>
              </Row>

          </Widget>
          </Form>

          <Modal title="Add New Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose>
            <Form form={catForm} layout="vertical" preserve={false}>
              <Form.Item name="cat_name" label="Category Name" rules={[{ required: true, message: 'Enter category name' }]}>
                <Input placeholder="e.g. Electronics" />
              </Form.Item>
            </Form>
          </Modal>
      </Drawer>
    </>
  );
});
export default AddProduct;