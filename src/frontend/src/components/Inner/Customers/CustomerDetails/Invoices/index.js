import React,{useState, useContext} from "react";
import Widget from "components/Widget";
import {Table,Badge} from "antd";
import {CategoryContext} from "appContext/TypeContext.js";

const columns = [
  {
    title: 'Date',
    dataIndex: 'start_date',
    render: (text, record) => {
      return <div className="gx-flex-row gx-align-items-center">
        <p className="gx-mb-0">{record.start_date}</p>
      </div>
    },
  },	
 
  {
    title: 'No.',
    dataIndex: 'number',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.number}</span>
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
    title: 'Status',
    dataIndex: 'transfer',
    render: (text, record) => {
      return <span className="gx-text-grey">{record.status}</span>
    },   

  }, 

];


const Invoices = ({data, title}) => {
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
      <h2 className="h4 gx-text-capitalize gx-mb-0">{title}</h2>
    } 
    >       
      <div className="gx-table-responsive">
        <Table className="gx-table-no-bordered" columns={columns} dataSource={data} pagination={false} size="small"/>
      </div> 
    </Widget>

  )
}


export default Invoices;
