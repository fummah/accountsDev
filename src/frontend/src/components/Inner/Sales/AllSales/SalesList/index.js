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


const SalesList = ({sales}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      sorter: (a, b) => a.date - b.date,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.date}</p>
        </div>
      },
    },
    {
      title: 'Type',
      dataIndex: 'type',
      sorter: (a, b) => a.type - b.type,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.type}</span>
      },
  
    },
    {
      title: 'No.',
      dataIndex: 'no',
      sorter: (a, b) => a.no - b.no,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.no}</span>
      },
  
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.customer}</span>
      },
    },
      {
        title: 'Memo',
        dataIndex: 'memo',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.memo}</span>
        },
  
    },
    ,
      {
        title: 'Amount',
        dataIndex: 'amount',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.amount}</span>
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
      render: (text,record) => {
        return <span className="gx-text-primary gx-pointer gx-d-inline-flex" onClick={()=>redirectToItem(record.key,'claim')}>
          <i className="icon icon-forward gx-fs-sm gx-mr-2" title="View"/>
          <Dropdown overlay={menus} placement="bottomRight" title="More" trigger={['click']}>
                <i className="gx-ml-2 icon icon-ellipse-v"/>
              </Dropdown>
           
           </span>
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
    selectedRowKeys,
    onChange: onSelectChange,
  };
  const hasSelected = selectedRowKeys.length > 0;
  return (
<>
    <Row>
    <Col xs={24} sm={8} md={8}>
    <Input placeholder="search1..." suffix={<SearchOutlined />} />
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
        <Table rowSelection={rowSelection} className="gx-table-no-bordered" columns={columns} dataSource={sales} pagination={true} size="small"/>
      
      </div>
      </>
  );
};

export default SalesList;
