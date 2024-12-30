import React, { useState } from 'react';
import {Table,Dropdown,Menu,Col, Row, List} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input } from 'antd';
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


const VatList = ({vat, onSelectVat, setAddUserState, handleSearch, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Vat Name',
      dataIndex: 'vat_name',
      sorter: (a, b) => a.first_name - b.first_name,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.vat_name}</p>
        </div>
      },
    }, 
    {
      title: 'Percentage',
      dataIndex: 'vat_percentage',
      sorter: (a, b) => a.vat_percentage - b.vat_percentage,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.vat_percentage}</span>
      },  
    },
    {
      title: 'Action',
      dataIndex: 'id',
      render: (text,record) => {
        return <>
        <span className="gx-text-primary gx-pointer gx-d-inline-flex" onClick={()=>{onSelectVat(record)}}>
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
      onSelectVat(record); // Trigger when a row is selected
      setAddUserState(true);
    },
  };

  const hasSelected = selectedRowKeys.length > 0;
  return (
<>
    <Row>
    <Col xs={24} sm={8} md={8}>
    <Input placeholder="search..." suffix={<SearchOutlined/>} onKeyUp={handleSearch}/>
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
        <Table rowSelection={rowSelection} 
        className="gx-table-no-bordered" 
        columns={columns} 
        dataSource={vat} 
        pagination={true} 
        size="small"
        rowKey="id"
        onRow={(record) => ({
          onClick: () => {
            onSelectVat(record); // Trigger selection when row is clicked
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

export default VatList;
