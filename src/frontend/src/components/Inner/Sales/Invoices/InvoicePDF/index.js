import React from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { DownloadOutlined } from '@ant-design/icons';

 const formattedNumber = (number) => { 
        const num = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(number); 
      return `$${num}`;
      };

const InvoicePDF = ({ invoice, type }) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Add Title
    doc.setFontSize(16);
    doc.text(type, 14, 20);
    const logoUrl = `${process.env.PUBLIC_URL}/assets/images/logo.png`;
    const imgWidth = 40; // Adjust the image width
    const imgHeight = 20; // Adjust the image height
    doc.addImage(logoUrl, "PNG", 160, 10, imgWidth, imgHeight);
    // Add Invoice Header
    doc.setFontSize(12);
    doc.text(`${type} Number: ${invoice.number}`, 14, 30);
    doc.text(`Date: ${invoice.start_date}`, 14, 40);
    doc.text(`Due Date: ${invoice.last_date}`, 14, 50);
    doc.text(`Customer Name: ${invoice.first_name} ${invoice.last_name}`, 14, 60);
    doc.text(`Billing Address: ${invoice.billing_address}`, 14, 70);

    // Add Table of Line Items
    const tableData = invoice.lines.map((line) => [
      line.description,
      line.quantity,
      formattedNumber(line.amount),
      `$${(line.quantity * line.amount).toFixed(2)}`,
    ]);

    doc.autoTable({
      head: [["Description", "Quantity", "Unit Price", "Line Total"]],
      body: tableData,
      startY: 80,
    });
    const subtotal = invoice.lines.reduce((total, item) => total + (item.amount || 0) * (item.quantity || 0), 0);
    const calculatedVat = subtotal * (invoice.vat / 100);
    const mTotal = subtotal + calculatedVat;
    // Add Total and Notes
    const finalY = doc.lastAutoTable.finalY; // Get the last Y position after the table
    doc.text(`Tax: $${calculatedVat.toFixed(2)}`, 14, finalY + 10);
    doc.text(`Total: $${mTotal.toFixed(2)}`, 14, finalY + 20);

    // Save PDF
    doc.save(`${invoice.number}.pdf`);
  };

  return (
  
      <DownloadOutlined style={{ fontSize: '24px', cursor: 'pointer' }} onClick={generatePDF}/>
  
  );
};

export default InvoicePDF;
