import React, { useState } from 'react';
import {Table,Dropdown,Menu,Col, Row} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input, Space } from 'antd';
import { SearchOutlined,PrinterOutlined, DownloadOutlined } from '@ant-design/icons';

const options = [
  'Edit',
  'Delete',
];

const menus = () => (<Menu onClick={(e) => {
  if (e.key === 'Edit') {    
  } else {
   
  }
}
}>
  {options.map(option =>
    <Menu.Item key={option}> 
      {option}
    </Menu.Item>,
  )}
</Menu>);
  const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number); 
};

const taxCalc = (amount, vat) =>{
let withvat = amount + (amount*vat/100);
return formattedNumber(withvat);
}

const InvoicesList = ({dataList, onSelectInvoice,setAddUserState, setDetails,handleSearchedTxt, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      sorter: (a, b) => a.start_date - b.start_date,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.start_date}</p>
        </div>
      },
    },
    {
      title: 'No.',
      dataIndex: 'number',
      sorter: (a, b) => a.number - b.number,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.number}</span>
      },
  
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.customer_name}</span>
      },
    }
    ,
      {
        title: 'Amount',
        dataIndex: 'amount',
        render: (text, record) => {
          return <span className="gx-text-grey">${taxCalc(record.amount, record.vat)}</span>
        },
  
    },
    ,
      {
        title: 'Status',
        dataIndex: 'status',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.status}</span>
        },
  
    },
    {
      title: 'Action',
      dataIndex: 'status',
      render: (text, record) => {
        return (
          <>
          <span
            className="gx-text-primary gx-pointer gx-d-inline-flex"
            onClick={(event) => {
              event.stopPropagation(); // Prevent row click
              setDetails(0);
              onSelectInvoice(record);
              setAddUserState(true);
            }}
          >
            <i className="gx-ml-2 icon icon-edit" />
          </span>
            <span className="gx-text-danger gx-pointer gx-d-inline-flex" onClick={(event)=> {
              onDelete(record.id);
              event.stopPropagation();
                setAddUserState(false);
            }
              }>
               <i className="gx-ml-2 icon icon-trash"/>
                
                </span>
                </>
        );
      },
    },
  
  ];
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const start = () => {
    setLoading(true);
    // ajax request after empty completing
    setTimeout(() => {
      setSelectedRowKeys([]);
      setLoading(false);
    }, 1000);
  };
  const onSelectChange = (newSelectedRowKeys) => {
    console.log('selectedRowKeys changed: ', newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };
  const rowSelection = {
    type: 'radio', // Set to 'radio' for single selection
    onSelect: (record) => {
      onSelectInvoice(record.id); // Trigger when a row is selected
      setDetails(1);
    },
  };
  const hasSelected = selectedRowKeys.length > 0;
  
  return (
<>
    <Row>
    <Col xs={24} sm={8} md={8}>
    <Input placeholder="search..." suffix={<SearchOutlined />} onKeyUp={handleSearchedTxt}/>
    </Col>
      <Col xs={24} sm={16} md={16}>
         <div style={{ display: 'flex', gap: '10px',float:"right" }}>
      <PrinterOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={() => window.print()} />
      <DownloadOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={() => alert("Exporting...")} />
    </div>
        </Col>
     </Row>
     {hasSelected ? `Selected ${selectedRowKeys.length} items` : null}
      <div className="gx-table-responsive">
        <Table 
        rowSelection={rowSelection} 
        className="gx-table-no-bordered" 
        columns={columns} 
        dataSource={dataList} 
        pagination={true} 
        size="small"
        onRow={(record) => ({
          onClick: () => {
            setDetails(1);
            onSelectInvoice(record.id); // Trigger selection when row is clicked
          },
          style: {
            cursor: 'pointer', 
            transition: 'background-color 0.3s ease',
          },
        })}/>
      
      </div>
      </>
  );
};

export default InvoicesList;
