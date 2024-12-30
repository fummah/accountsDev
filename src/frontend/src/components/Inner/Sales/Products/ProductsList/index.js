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


const ProductsList = ({products, onSelectProduct, setAddUserState, handleSearchedTxt, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      sorter: (a, b) => a.name - b.name,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.name}</p>
        </div>
      },
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      sorter: (a, b) => a.sku - b.sku,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.sku}</span>
      }, 
  
    },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.type}</span>
      },
    }
    ,
      {
        title: 'Sales description',
        dataIndex: 'description',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.description}</span>
        },
  
    },
    ,
      {
        title: 'Sales price',
        dataIndex: 'price',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.price}</span>
        },
  
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.cost}</span>
      },

  },
    {
      title: 'Action',
      dataIndex: 'status',
      render: (text,record) => {
        return <><span className="gx-text-primary gx-pointer gx-d-inline-flex">
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
      onSelectProduct(record); // Trigger when a row is selected
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
      <DownloadOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={() => alert("Exporting...")} />
    </div>
        </Col>
     </Row>
     {hasSelected ? `Selected ${selectedRowKeys.length} items` : null}
      <div className="gx-table-responsive">
        <Table rowSelection={rowSelection} 
        className="gx-table-no-bordered" 
        columns={columns} 
        dataSource={products} 
        pagination={true} size="small"
        onRow={(record) => ({
          onClick: () => {
            onSelectProduct(record); // Trigger selection when row is clicked
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

export default ProductsList;
