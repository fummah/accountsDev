import React from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { DownloadOutlined } from '@ant-design/icons';

const InvoicePDF = ({ invoice }) => {
  const generatePDF = () => {
    const doc = new jsPDF();

    // Add Title
    doc.setFontSize(16);
    doc.text("Invoice", 14, 20);

    // Add Invoice Header
    doc.setFontSize(12);
    doc.text(`Invoice Number: ${invoice.header.invoiceNumber}`, 14, 30);
    doc.text(`Date: ${invoice.header.date}`, 14, 40);
    doc.text(`Due Date: ${invoice.header.dueDate}`, 14, 50);
    doc.text(`Customer Name: ${invoice.header.customerName}`, 14, 60);
    doc.text(`Billing Address: ${invoice.header.billingAddress}`, 14, 70);

    // Add Table of Line Items
    const tableData = invoice.lines.map((line) => [
      line.description,
      line.quantity,
      line.unitPrice.toFixed(2),
      line.lineTotal.toFixed(2),
    ]);

    doc.autoTable({
      head: [["Description", "Quantity", "Unit Price", "Line Total"]],
      body: tableData,
      startY: 80,
    });

    // Add Total and Notes
    const finalY = doc.lastAutoTable.finalY; // Get the last Y position after the table
    doc.text(`Tax: $${invoice.header.tax}`, 14, finalY + 10);
    doc.text(`Total: $${invoice.header.totalAmount.toFixed(2)}`, 14, finalY + 20);
    doc.text(`Notes: ${invoice.header.notes}`, 14, finalY + 30);

    // Save PDF
    doc.save(`Invoice-${invoice.header.invoiceNumber}.pdf`);
  };

  return (
  
      <DownloadOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={generatePDF}/>
  
  );
};

export default InvoicePDF;
