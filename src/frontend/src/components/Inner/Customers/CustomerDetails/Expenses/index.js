import React,{useState, useContext} from "react";
import Widget from "components/Widget";
import {Table,Badge} from "antd";
import {CategoryContext} from "appContext/TypeContext.js";

const columns = [
  {
    title: 'Payment Account',
    dataIndex: 'payment_account',
    render: (text, record) => {
      return <div className="gx-flex-row gx-align-items-center">
        <p className="gx-mb-0">{record.payment_account}</p>
      </div>
    },
  },	
  {
    title: 'Ref No.',
    dataIndex: 'ref_no',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.ref_no}</span>
    }
  }
 ,
  {
    title: 'Amount',
    dataIndex: 'amount',
    render: (text, record) => {
      const formattedAmount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(record.amount);
      return <span className="gx-text-grey">{formattedAmount}</span>
    },   

  },
  ,
  {
    title: 'Approval Status',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.approval_status}</span>
    },   

  }, 

];


const Expenses = ({data}) => {
  const type = useContext(CategoryContext);
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
      <h2 className="h4 gx-text-capitalize gx-mb-0">Expenses</h2>
    } 
    >       
      <div className="gx-table-responsive">
        <Table className="gx-table-no-bordered" columns={columns} dataSource={data} pagination={false} size="small"/>
      </div> 
    </Widget>

  )
}


export default Expenses;
