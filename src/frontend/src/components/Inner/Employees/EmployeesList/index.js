import React, { useState } from 'react';
import {Table,Dropdown,Menu,Col, Row, List} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input } from 'antd';
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


const EmployeesList = ({employees, onSelectEmployee, setAddUserState, handleSearchedTxt, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'First Name',
      dataIndex: 'image',
      sorter: (a, b) => a.first_name - b.first_name,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.first_name} {record.mi} {record.last_name}</p>
        </div>
      },
    }, 
    {
      title: 'Email',
      dataIndex: 'email',
      sorter: (a, b) => a.email - b.email,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.email}</span>
      },
  
    },
    {
      title: 'Date Entered',
      dataIndex: 'date_entered',
      sorter: (a, b) => a.date_entered - b.date_entered,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.date_entered}</span>
      },
  
    },   {
      title: 'Salary',
      dataIndex: 'salary',
      sorter: (a, b) => a.salary - b.salary,
      render: (text, record) => {
        return <span className="gx-text-grey">{formattedNumber(record.salary)}</span>
      },
  
    },
    {
      title: 'Action',
      dataIndex: 'id',
      render: (text,record) => {
        return <><span className="gx-text-primary gx-pointer gx-d-inline-flex" 
        onClick={()=>
        {onSelectEmployee(record)}}>
        <i className="gx-ml-2 icon icon-edit"/>           
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
      },
    },
  
  ];
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [loading, setLoading] = useState(false);

  const rowSelection = {
    type: 'radio', // Set to 'radio' for single selection
    onSelect: (record) => {
      onSelectEmployee(record); // Trigger when a row is selected
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
        dataSource={employees} 
        pagination={true} 
        size="small"
        rowKey="id"
        onRow={(record) => ({
          onClick: () => {
            onSelectEmployee(record); // Trigger selection when row is clicked
            setAddUserState(true);
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

export default EmployeesList;
