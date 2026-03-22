import React from 'react';
import { Card, Calendar } from 'antd';

const PayrollCalendar = () => {
  return (
    <div style={{ padding: 24 }}>
      <h2>Payroll Calendar</h2>
      <Card style={{ marginTop: 16 }}>
        <Calendar />
      </Card>
    </div>
  );
};

export default PayrollCalendar;
