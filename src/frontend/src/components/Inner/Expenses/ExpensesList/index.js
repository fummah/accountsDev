import React, { useState } from 'react';
import {Table,Dropdown,Menu,Col, Row} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input, Space } from 'antd';
import { SearchOutlined,PrinterOutlined } from '@ant-design/icons';

const options = [
  'Edit',
  'Delete',
];
const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number); 
};
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

const ExpensesList = ({ expenses, loading = false, total = 0, page = 1, pageSize = 25, onTableChange, onSearch, onSelectExpense, setAddUserState, setDetails, onDelete }) => {
  const redirectToItem = useRedirectToItem();
  const [searchInput, setSearchInput] = useState('');
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      sorter: (a, b) => a.payment_date - b.payment_date,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.payment_date}</p>
        </div>
      },
    },
    {
      title: 'Type',
      dataIndex: 'payment_method',
      sorter: (a, b) => a.payment_method - b.payment_method,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.payment_method}</span>
      },
  
    },
    {
      title: 'No.',
      dataIndex: 'no',
      sorter: (a, b) => a.ref_no - b.ref_no,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.ref_no}</span>
      },
  
    },
    {
      title: 'Payee',
      dataIndex: 'payee_name',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.payee_name}</span>
      },
  
    },
    {
      title: 'Category',
      dataIndex: 'category',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.category}</span>
      },
  
    },
    {
      title: 'Total',
      dataIndex: 'total',
      render: (text, record) => {
        return <span className="gx-text-grey">{formattedNumber(record.amount)}</span>
      },
    },
    {
      title: 'Approval status',
      dataIndex: 'approval_status',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.approval_status}</span>
      },     
  
    },
    {
      title: 'Action',
      dataIndex: 'approval_status',
      render: (text, record) => {
        return (<>
          <span
            className="gx-text-primary gx-pointer gx-d-inline-flex"
            onClick={(event) => {
             
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
    type: 'radio',
    onSelect: (record) => {
      if (setDetails) setDetails(0);
      onSelectExpense(record);
      setAddUserState(true);
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
        dataSource={expenses || []} 
        loading={loading}
        pagination={typeof onTableChange === 'function' ? { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (t) => `Total ${t} items`, onChange: (p, size) => onTableChange(p, size) } : true}
        size="small"
        onRow={(record) => ({
          onClick: () => {
            onSelectExpense(record); // Trigger selection when row is clicked
            setAddUserState(true);
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

export default ExpensesList;
