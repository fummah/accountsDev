import React,{useState, useRef, useEffect} from "react";
import {Col, Row, Alert} from "antd";
import Auxiliary from "util/Auxiliary";
import Widget from "components/Widget/index";
import ProductsList from "components/Inner/Sales/Products/ProductsList";
import AddProduct from 'components/Inner/Sales/Products/AddProduct';
import Toast from "components/AppNotification/toast.js";

const ProductsTab = () => {
  const addProductRef = useRef();
  const [loadings, setLoadings] = useState([]);
  const [addUserState, setAddUserState] = useState(false);
  const [isSuccess, setIsSuccess] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsSearched, setProductsSearched] = useState([]);
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
        fetchProducts();
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
        fetchProducts();
      
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
  
    const fetchProducts = async () => {
        try {
            const response = await await window.electronAPI.getAllProducts();          
            setProducts(response);
            setProductsSearched(response);
        } catch (error) {
          setMessage("Error fetching products:", error);
          setShowError(true);
        }
    };

    useEffect(() => {
      fetchProducts();
  }, []);

  const handleUserClose = () => {
    setAddUserState(false);
  };
  const showDrawer = () => {
    setSelectedProduct(null);
    setAddUserState(true);
  };

  const handleSearchedTxt = (event) => {
    const value = event.target.value.toLowerCase();
    if (value.trim() !== '')
    {
      const filtered = products.filter(
        (item) =>
          (item.name && item.name.toLowerCase().includes(value)) ||
        (item.sku && item.sku.toLowerCase().includes(value)) 
      );
      setProductsSearched(filtered);
    }
    else{
      setProductsSearched(products);
    }
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
      <ProductsList products={productsSearched} onSelectProduct={setSelectedProduct} setAddUserState={setAddUserState} handleSearchedTxt={handleSearchedTxt} onDelete={deleteRecord}/>
        </Col>
              
      </Row><hr/>
      
      </Widget>
    </Auxiliary>
  );
};

export default ProductsTab;
