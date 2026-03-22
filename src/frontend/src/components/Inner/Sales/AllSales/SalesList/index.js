import React, { useState } from 'react';
import { Table, Dropdown, Menu, Col, Row } from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input } from 'antd';
import { SearchOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import StatusBadge from "components/StatusBadge";

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


const SalesList = ({ sales = [], loading = false, total = 0, page = 1, pageSize = 25, onTableChange, onSearch }) => {
  const redirectToItem = useRedirectToItem();
  const [searchInput, setSearchInput] = useState('');
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
    {
        title: 'Amount',
        dataIndex: 'amount',
        render: (text, record) => {
          return <span className="gx-text-grey">{record.amount}</span>
        },
    },
    {
        title: 'Status',
        dataIndex: 'status',
        render: (text, record) => <StatusBadge status={record.status} />,
    },
  ];
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys) => setSelectedRowKeys(newSelectedRowKeys),
  };
  const hasSelected = selectedRowKeys.length > 0;
  return (
<>
    <Row>
    <Col xs={24} sm={8} md={8}>
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
          dataSource={sales}
          loading={loading}
          pagination={typeof onTableChange === 'function' ? {
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50', '100'],
            showTotal: (t) => `Total ${t} items`,
            onChange: (p, size) => onTableChange(p, size),
          } : true}
          size="small"
        />
      </div>
      </>
  );
};

export default SalesList;
