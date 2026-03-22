import React, { useState, useRef, useEffect, useCallback } from "react";
import { Col, Row, Alert, Spin } from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import ProductsList from "components/Inner/Sales/Products/ProductsList";
import AddProduct from 'components/Inner/Sales/Products/AddProduct';
import Toast from "components/AppNotification/toast.js";

const PAGE_SIZE = 25;

const ProductsTab = () => {
  const addProductRef = useRef();
  const [addUserState, setAddUserState] = useState(false);
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const onSaveUser = async(userData) => {
    console.log("User Data Saved:", userData);
    
    try {
      
      const type = userData.type;
      const name = userData.name;
      const sku = userData.sku;
      const category = userData.category;
      const description = userData.description;
      const price = userData.price;
      const income_account = userData.income_account;
      const tax_inclusive = userData.tax_inclusive;
      const tax = userData.tax;
      const isfromsupplier = userData.isfromsupplier;     
      const entered_by = "1";

      let result;
        
      if (userData.id) {
        const id = userData.id;
        const productData = {id,type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by};
        result = await window.electronAPI.updateProduct(productData);   
      }
      else{
        result = await window.electronAPI.insertProduct(type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by);
          }
             setIsSuccess(result.success);
  
      if (result.success) {
        setMessage('Details successfully saved!');
        fetchProducts(page, pageSize, search);
        if (addProductRef.current) {
          addProductRef.current.resetForm();
          handleUserClose();
      }
      } else {
        setMessage('Failed to add details. Please try again.');
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
      let result = await window.electronAPI.deleteRecord(id,"products");
        
      setIsSuccess(result.success);  
      if (result.success) {
        setMessage('Record deleted successfully!');
        fetchProducts(page, pageSize, search);
      
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
  
    const fetchProducts = useCallback(async (p = 1, size = PAGE_SIZE, searchTerm = '', type = typeFilter) => {
        try {
            setLoading(true);
            const res = await window.electronAPI.getProductsPaginated(p, size, searchTerm, type || '');
            if (res && res.error) { setMessage("Error fetching products: " + res.error); setShowError(true); return; }
            setProducts(res.data || []);
            setTotal(res.total || 0);
            setPage(p);
            setPageSize(size);
        } catch (error) {
          setMessage("Error fetching products: " + (error.message || error));
          setShowError(true);
        } finally { setLoading(false); }
    }, [typeFilter]);

    useEffect(() => { fetchProducts(1, PAGE_SIZE, ''); }, []);

    const handleTableChange = (p, size) => { fetchProducts(p, size, search, typeFilter); };
    const handleSearch = (value) => { setSearch(value); fetchProducts(1, pageSize, value, typeFilter); };

    const handleTypeFilterChange = (value) => {
      const v = value || '';
      setTypeFilter(v);
      fetchProducts(1, pageSize, search, v);
    };

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedProduct(null);
    setAddUserState(true);
  };

  return (
    <Auxiliary> 
      <Toast title="Error" message={message} setShowError={setShowError} show={showError} />
       <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Products and Services</h2>
      } 
      extra={
        <AddProduct 
        product={selectedProduct}
        open={addUserState} 
        onSaveUser={onSaveUser} // Pass the function
        onUserClose={handleUserClose} 
        showDrawer={showDrawer}
        setShowError={setShowError}
        setMessage={setMessage}
        ref={addProductRef}
      />
        }> 
         {isSuccess !== null && (
        <Alert message={message} type={isSuccess?'success':'error'} closable/>
        )
      }  
      <Row>
      <Col span={24}>
      <ProductsList
        products={products}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        onTableChange={handleTableChange}
        onSearch={handleSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={handleTypeFilterChange}
        onSelectProduct={setSelectedProduct}
        setAddUserState={setAddUserState}
        onDelete={deleteRecord}
      />
        </Col>
              
      </Row><hr/>
      
      </Widget>
    </Auxiliary>
  );
};

export default ProductsTab;
