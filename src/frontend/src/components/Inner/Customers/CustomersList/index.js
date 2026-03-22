import React, { useState } from 'react';
import {Table,Dropdown,Menu,Col, Row} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input, Space } from 'antd';
import { SearchOutlined,PrinterOutlined } from '@ant-design/icons';

const CustomersList = ({ customers, loading = false, total = 0, page = 1, pageSize = 25, onTableChange, onSearch, onSelectCustomer, setAddUserState, setDetails, onDelete }) => {
  const redirectToItem = useRedirectToItem();
  const [searchInput, setSearchInput] = useState('');
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
        return <span className="gx-text-grey">{(Number(record.opening_balance) || 0).toFixed(2)}</span>
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
              onSelectCustomer(record);
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
      onSelectCustomer(record.id); // Trigger when a row is selected
    },
  };

  const hasSelected = selectedRowKeys.length > 0;
  return (
<>
    <Row>
    <Col xs={24} sm={8} md={8}>
    <Input placeholder="Search (press Enter)" suffix={<SearchOutlined />} allowClear value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onPressEnter={() => typeof onSearch === 'function' && onSearch(searchInput)} onClear={() => { setSearchInput(''); typeof onSearch === 'function' && onSearch(''); }} />
    </Col>
      <Col xs={24} sm={16} md={16}>
         <div style={{ display: 'flex', gap: '10px',float:"right" }}>
      <PrinterOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={() => window.print()} />
    </div>
        </Col>
     </Row>
     {hasSelected ? `Selected ${selectedRowKeys.length} items` : null}
      <div className="gx-table-responsive">
      <Table rowSelection={rowSelection} 
        className="gx-table-no-bordered" 
        columns={columns} 
        dataSource={customers || []} 
        loading={loading}
        pagination={typeof onTableChange === 'function' ? { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (t) => `Total ${t} items`, onChange: (p, size) => onTableChange(p, size) } : true}
        size="small"
        onRow={(record) => ({
          onClick: () => {
            setDetails(1);
            onSelectCustomer(record.id); // Trigger selection when row is clicked
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

export default CustomersList;
