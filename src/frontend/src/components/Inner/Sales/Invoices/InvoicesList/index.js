import React, { useState, useContext } from 'react';
import { Table, Dropdown, Menu, Col, Row, Select, Input } from "antd";
import { useHistory } from 'react-router-dom';
import { useRedirectToItem } from 'util/navigation';
import { TypeContext } from 'appContext/TypeContext.js';
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
  const formattedNumber = (number) => { return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number); 
};

const taxCalc = (amount, vat) =>{
let withvat = amount + (amount*vat/100);
return formattedNumber(withvat);
}

const InvoicesList = ({ dataList, loading = false, total = 0, page = 1, pageSize = 25, onTableChange, onSearch, statusFilter, onStatusFilterChange, onSelectInvoice, setAddUserState, setDetails, onDelete }) => {
  const redirectToItem = useRedirectToItem();
  const history = useHistory();
  const docType = useContext(TypeContext) || 'Invoice';
  const [searchInput, setSearchInput] = useState('');
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      sorter: (a, b) => a.start_date - b.start_date,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center">       
          <p className="gx-mb-0">{record.start_date}</p>
        </div>
      },
    },
    {
      title: 'No.',
      dataIndex: 'number',
      sorter: (a, b) => a.number - b.number,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.number}</span>
      },
  
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.customer_name}</span>
      },
    }
    ,
      {
        title: 'Amount',
        dataIndex: 'amount',
        render: (text, record) => {
          return <span className="gx-text-grey">${taxCalc(record.amount, record.vat)}</span>
        },
  
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (text, record) => <StatusBadge status={record.status} />,
    },
    {
      title: 'Action',
      dataIndex: 'status',
      render: (text, record) => {
        return (
          <>
          <span
            className="gx-text-primary gx-pointer gx-d-inline-flex"
            onClick={(event) => {
              event.stopPropagation();
              const editPath = docType === 'Quote'
                ? `/main/customers/quotes/edit/${record.id}`
                : `/main/customers/invoices/edit/${record.id}`;
              history.push(editPath);
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
  const start = () => {
    setTimeout(() => {
      setSelectedRowKeys([]);
    }, 1000);
  };
  const onSelectChange = (newSelectedRowKeys) => {
    console.log('selectedRowKeys changed: ', newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };
  const rowSelection = {
    type: 'radio', // Set to 'radio' for single selection
    onSelect: (record) => {
      onSelectInvoice(record.id); // Trigger when a row is selected
      setDetails(1);
    },
  };
  const hasSelected = selectedRowKeys.length > 0;
  
  return (
<>
    <Row gutter={8}>
    <Col xs={24} sm={10} md={8}>
      <Input 
        placeholder="Search by customer or number (press Enter)" 
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
          placeholder="Filter by status"
          style={{ width: '100%' }}
          value={statusFilter || undefined}
          onChange={(value) =>
            typeof onStatusFilterChange === 'function' && onStatusFilterChange(value)
          }
        >
          <Select.Option value="Pending">Pending</Select.Option>
          <Select.Option value="Paid">Paid</Select.Option>
          <Select.Option value="Partially Paid">Partially Paid</Select.Option>
          <Select.Option value="Cancelled">Cancelled</Select.Option>
          <Select.Option value="Rejected">Rejected</Select.Option>
          <Select.Option value="Invoiced">Invoiced</Select.Option>
        </Select>
      </Col>
      <Col xs={24} sm={8} md={10}>
         <div style={{ display: 'flex', gap: '10px', float:"right" }}>
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
        dataSource={dataList || []} 
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          showTotal: (t) => `Total ${t} items`,
          onChange: typeof onTableChange === 'function' ? (p, size) => onTableChange(p, size) : undefined,
        }}
        size="small"
        onRow={(record) => ({
          onClick: () => {
            setDetails(1);
            onSelectInvoice(record.id); // Trigger selection when row is clicked
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

export default InvoicesList;
