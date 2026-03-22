import React, { useState } from 'react';
import { Table, Dropdown, Menu, Col, Row, Select, Input } from "antd";
import { useRedirectToItem } from 'util/navigation';
import { SearchOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';

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


const ProductsList = ({ products, loading = false, total = 0, page = 1, pageSize = 25, onTableChange, onSearch, typeFilter, onTypeFilterChange, onSelectProduct, setAddUserState, onDelete }) => {
  const redirectToItem = useRedirectToItem();
  const [searchInput, setSearchInput] = useState('');
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
    },
    {
        title: 'Sales description',
        dataIndex: 'description',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.description}</span>
        },
    },
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
    <Row gutter={8}>
    <Col xs={24} sm={10} md={8}>
      <Input
        placeholder="Search (press Enter)"
        suffix={<SearchOutlined />}
        allowClear
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onPressEnter={() => typeof onSearch === 'function' && onSearch(searchInput)}
        onClear={() => { setSearchInput(''); typeof onSearch === 'function' && onSearch(''); }}
      />
    </Col>
      <Col xs={24} sm={6} md={6}>
        <Select
          allowClear
          placeholder="Filter by type"
          style={{ width: '100%' }}
          value={typeFilter || undefined}
          onChange={(value) =>
            typeof onTypeFilterChange === 'function' && onTypeFilterChange(value)
          }
        >
          <Select.Option value="Product">Product</Select.Option>
          <Select.Option value="Service">Service</Select.Option>
        </Select>
      </Col>
      <Col xs={24} sm={8} md={10}>
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
        dataSource={products || []} 
        loading={loading}
        pagination={typeof onTableChange === 'function' ? { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (t) => `Total ${t} items`, onChange: (p, size) => onTableChange(p, size) } : true}
        size="small"
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
