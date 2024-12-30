import React from "react";
import {Table,Dropdown,Menu,Badge} from "antd";
import Widget from "components/Widget/index";
import { useRedirectToItem } from 'util/navigation';

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


const ClaimsList = ({claimsList}) => {
  const redirectToItem = useRedirectToItem();
  const columns = [
    {
      title: 'Policyholder Name',
      dataIndex: 'image',
      sorter: (a, b) => a.name - b.name,
      render: (text, record) => {
        return <div className="gx-flex-row gx-align-items-center"> 
        <img className="gx-rounded-circle gx-size-30 gx-mr-2" src={text} alt=""/>      
          <p className="gx-mb-0">{record.name}</p>
        </div>
      },
    },
    {
      title: 'Email',
      dataIndex: 'transfer',
      sorter: (a, b) => a.email - b.email,
      render: (text, record) => {
        return <span className="gx-text-grey">{record.email}</span>
      },
  
    },
  
    {
      title: 'Amount',
      dataIndex: 'transfer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.amount}</span>
      },
  
    },
    {
      title: 'ICD10 Code',
      dataIndex: 'transfer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.icd10}</span>
      },
  
    },
    {
      title: 'Date Entered',
      dataIndex: 'transfer',
      render: (text, record) => {
        return <span className="gx-text-grey">{record.date_entered}</span>
      },
  
    },
    {
      title: 'Status',
      dataIndex: 'transfer',
      render: (text, record) => {
        return <span className="gx-text-grey"><Badge count={record.claim_status} showZero color="green" /></span>
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
  return (
    <Widget
      title={
        <h2 className="h4 gx-text-capitalize gx-mb-0">
          Claims</h2>
      }>
      <div className="gx-table-responsive">
        <Table className="gx-table-no-bordered" columns={columns} dataSource={claimsList} pagination={true}
               size="small"/>
      </div>
    </Widget>
  );
};

export default ClaimsList;
