import React, { useState, useRef, useEffect } from 'react';
import {Table, Dropdown, Menu, Col, Row, List, Typography, message, Button} from "antd";
import { useRedirectToItem } from 'util/navigation';
import { Input } from 'antd';
import { SearchOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import './print.css';

const { Title } = Typography;

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


// Printable component
const PrintableContent = React.forwardRef(({ vat, companyName = "Your Company" }, ref) => {
  const printColumns = [
    {
      title: 'VAT Name',
      dataIndex: 'vat_name',
    },
    {
      title: 'Percentage',
      dataIndex: 'vat_percentage',
      render: (text) => text ? `${text}%` : '-',
    }
  ];

  return (
    <div ref={ref} className="printable-content" style={{ padding: '30px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <Title level={2} style={{ marginBottom: '10px' }}>{companyName}</Title>
      <Title level={2} style={{ textAlign: 'center', marginBottom: 20 }}>VAT Rates List</Title>
        <div style={{ fontSize: '14px', marginBottom: '20px' }}>
          Generated on: {new Date().toLocaleString()}
        </div>
      </div>
      <Table
        columns={printColumns}
        dataSource={vat}
        pagination={false}
        rowKey="id"
        bordered
        style={{ marginBottom: '30px' }}
      />
      <div style={{ marginTop: '30px', fontSize: '12px', textAlign: 'right' }}>
        Page 1 of 1
      </div>
    </div>
  );
});

const VatList = ({vat, onSelectVat, setAddUserState, handleSearch, onDelete}) => {
  const redirectToItem = useRedirectToItem();
  const componentRef = useRef();
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    documentTitle: 'VAT_Rates_List',
    onBeforeGetContent: () => {
      setIsPrinting(true);
      console.log('Preparing print content...');
    },
    onAfterPrint: () => {
      setIsPrinting(false);
      console.log('Print completed');
      message.success('Document printed successfully');
    },
    removeAfterPrint: true
  });

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
        <div style={{ display: 'flex', gap: '10px', float: "right" }}>
          <Button
            type="default"
            icon={<PrinterOutlined />}
            onClick={() => {
              if (!isPrinting && vat && vat.length > 0) {
                handlePrint();
              } else if (!vat || vat.length === 0) {
                message.warning('No VAT data to print');
              }
            }}
          >
            Print
          </Button>
          <Button
            type="default"
            icon={<DownloadOutlined />}
            onClick={() => alert("Exporting...")}
          >
            Export
          </Button>
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

      <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '100%' }}>
        <PrintableContent ref={componentRef} vat={vat} />
      </div>
      </>
  );
};

export default VatList;
