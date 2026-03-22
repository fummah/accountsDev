import React from 'react';
import { Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

const AddTransaction = ({type}) => {
  const history = useHistory();

  const items = [
    { label: 'Customers', key: 'customers' },
    { label: 'Invoices', key: 'invoices' },
    { label: 'Quotes', key: 'quotes' },
    { label: 'Products and Services', key: 'products' },
    { label: 'Statements', key: 'statements' },
    { label: 'Receive Payments', key: 'payments' },
    { label: 'Income Tracker', key: 'income' },
    { label: 'Recurring Transactions', key: 'recurring' },
    { label: 'Item List', key: 'items' },
  ];

  const handleMenuClick = ({ key }) => {
    switch (key) {
      case 'customers':
        history.push('/inner/sales?tab=9');
        break;
      case 'invoices':
        history.push('/inner/sales?tab=2');
        break;
      case 'quotes':
        history.push('/inner/sales?tab=3');
        break;
      case 'products':
        history.push('/inner/sales?tab=10');
        break;
      case 'statements':
        history.push('/inner/sales?tab=4');
        break;
      case 'payments':
        history.push('/inner/sales?tab=5');
        break;
      case 'income':
        history.push('/inner/sales?tab=6');
        break;
      case 'recurring':
        history.push('/inner/sales?tab=7');
        break;
      case 'items':
        history.push('/inner/sales?tab=8');
        break;
      default:
        break;
    }
  };

  return (
    <>
      <Dropdown.Button
        type="primary"
        icon={<DownOutlined />}
        menu={{ items, onClick: handleMenuClick }}
      >
        Quick actions
      </Dropdown.Button>
    </>
  );
};
export default AddTransaction;