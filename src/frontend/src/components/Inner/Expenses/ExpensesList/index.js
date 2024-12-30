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

const ExpensesList = ({expenses, onSelectExpense, setAddUserState, setDetails, handleSearchedTxt, onDelete}) => {
  const redirectToItem = useRedirectToItem();
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
    type: 'radio', // Set to 'radio' for single selection
    onSelect: (record) => {
      setDetails(0);
      onSelectExpense(record); // Trigger when a row is selected
      setAddUserState(true);
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
    </div>
        </Col>
     </Row>
     {hasSelected ? `Selected ${selectedRowKeys.length} items` : null}
      <div className="gx-table-responsive">
        <Table rowSelection={rowSelection} 
        className="gx-table-no-bordered" 
        columns={columns} 
        dataSource={expenses} 
        pagination={true} 
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
