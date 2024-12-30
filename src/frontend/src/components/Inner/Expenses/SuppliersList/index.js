import React, { useState } from 'react';
import {Table,Col, Row} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input, Space } from 'antd';
import { SearchOutlined,PrinterOutlined, DownloadOutlined } from '@ant-design/icons'; 


const SuppliersList = ({suppliers, onSelectSupplier, setAddUserState, setDetails, handleSearchedTxt, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Name',
      dataIndex: 'image',
      sorter: (a, b) => a.first_name - b.first_name,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.first_name} {record.middle_name} {record.last_name}</p>
        </div>
      },
    }, 
    {
      title: 'Company Name',
      dataIndex: 'transfer',
      sorter: (a, b) => a.company_name - b.company_name,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.company_name}</span>
      },
  
    },
    {
      title: 'Phone',
      dataIndex: 'transfer',
      sorter: (a, b) => a.phone_number - b.phone_number,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.phone_number}</span>
      },
  
    },
    {
      title: 'Open Balance',
      dataIndex: 'transfer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.opening_balance}</span>
      },
  
    },
    {
      title: 'Action',
      dataIndex: 'id',
      render: (text, record) => {
        return (
          <>
          <span
            className="gx-text-primary gx-pointer gx-d-inline-flex"
            onClick={(event) => {
              event.stopPropagation(); // Prevent row click
              setDetails(0);
              onSelectSupplier(record);
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

  const rowSelection = {
    type: 'radio', // Set to 'radio' for single selection
    onSelect: (record) => {
      setDetails(1);
      onSelectSupplier(record.id); // Trigger when a row is selected
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
        dataSource={suppliers} 
        pagination={true} 
        size="small"
          onRow={(record) => ({
          onClick: () => {
            setDetails(1);
            onSelectSupplier(record.id); // Trigger selection when row is clicked
          },
          style: {
            cursor: 'pointer', 
            transition: 'background-color 0.3s ease',
          },
        })}
        />
      </div>
      </>
  );
};

export default SuppliersList;
