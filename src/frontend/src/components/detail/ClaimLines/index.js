import React,{useState} from "react";
import Widget from "components/Widget";
import {Table,Badge} from "antd";
import AddClaimDoctor from "./AddClaimDoctor";

const columns = [
  {
    title: 'Tariff Code',
    dataIndex: 'image',
    render: (text, record) => {
      return <div className="gx-flex-row gx-align-items-center">
        <p className="gx-mb-0">{record.tariff_code}</p>
      </div>
    },
  },
  {
    title: 'Treatment Date',
    dataIndex: 'claim_status',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.treatment_date}</span>
    }
  }
  ,
  {
    title: 'ICD10 Code',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.icd10_code}</span>
    },

  },
  {
    title: 'Amount',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.amount}</span>
    },   

  },
  ,
  {
    title: 'Status',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.claim_status}</span>
    },   

  },
  {
    title: 'Action',
    dataIndex: 'status',
    render: (text) => {
      return <span className="gx-text-primary gx-pointer">
        <i className="icon icon-edit gx-fs-sm gx-mr-2"/>{text}</span>
    },
  },

];

const data = [
  {
    key: '1',
    tariff_code: '2343',
    treatment_date: '2024-09-09',
    icd10_code: "J45.90",
    status: 'Edit',
    claim_status:'Open',
    amount:'R3 454.90',
  },
  {
    key: '2',
    tariff_code: '2343',
    treatment_date: '2024-09-09',
    icd10_code: "J45.90",
    status: 'Edit',
    claim_status:'Open',
    amount:'R3 454.90',
  },
  {
    key: '3',
    tariff_code: '2343',
    treatment_date: '2024-09-09',
    icd10_code: "J45.90",
    status: 'Edit',
    claim_status:'Open',
    amount:'R3 454.90',
  }
];



const ClaimLines = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toggleModal = () => {
    setIsModalOpen(true);
  };
  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };
  return (
    <Widget styleName="gx-card-profile" 
    title={
      <h2 className="h4 gx-text-capitalize gx-mb-0">
        Doctor(s) <Badge count={1} showZero color="green" /></h2>
    } extra={
      <>
    <p className="gx-text-primary gx-mb-0 gx-pointer gx-d-none gx-d-sm-block" onClick={()=>toggleModal()}>
      <i className="icon icon-add-circle gx-fs-lg gx-d-inline-flex gx-vertical-align-middle"/> Add Claim Doctor</p>
      
      </>
  }
    >
     <h4 className="gx-text-grey gx-fs-md gx-mb-10">Dr Test Surname | 7586896</h4>    
      <div className="gx-table-responsive">
        <Table className="gx-table-no-bordered" columns={columns} dataSource={data} pagination={false}
               size="small"/>
      </div>  
      <p className="gx-text-primary gx-mb-0 gx-pointer gx-d-none gx-d-sm-block">
      <i className="icon icon-add-circle gx-fs-lg gx-d-inline-flex gx-vertical-align-middle"/> Add Claim Line</p>
      <AddClaimDoctor isOpen={isModalOpen} handleCancel={handleCancel} handleOk={handleOk}/>    
    </Widget>

  )
}


export default ClaimLines;
