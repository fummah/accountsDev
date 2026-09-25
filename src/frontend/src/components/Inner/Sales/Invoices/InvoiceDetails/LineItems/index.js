import React, {useContext} from "react";
import Widget from "components/Widget";
import { Table } from "antd";
import {TypeContext} from "appContext/TypeContext.js";
import { normalizeDocumentLines } from "utils/lineItems";

const LineItems = ({lines}) => {
  const type = useContext(TypeContext);
  // Never show the empty convenience row (or a legacy blank DB row).
  const cleanLines = normalizeDocumentLines(lines);
  
  const columns = [
    {
      title: "Product",
      dataIndex: "product",
      key: "product",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Quantity",
      dataIndex: "quantity",
      key: "quantity",
    },
    {
      title: "Rate",
      dataIndex: "rate",
      key: "rate",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount),
    },
  ];

    return (
      <Widget title={
        <h3 className="gx-ml-3">{type} Items</h3>
      } styleName="gx-card-tabs gx-card-profile">
       <Table dataSource={cleanLines} columns={columns} />;
      </Widget>
    );
}

export default LineItems;
