import React from 'react';
import { Link } from 'react-router-dom';
import { Row, Col } from 'antd';
import {
  UserOutlined, FileTextOutlined, FileDoneOutlined, AppstoreOutlined,
  ShoppingCartOutlined, DollarOutlined, ShopOutlined, CreditCardOutlined,
  BankOutlined, FormOutlined, BookOutlined, TeamOutlined
} from '@ant-design/icons';

const items = [
  {
    title: 'Sales',
    entries: [
      { icon: <UserOutlined />, label: 'Customer', path: '/main/customers/center' },
      { icon: <FileTextOutlined />, label: 'Invoice', path: '/main/customers/invoices/new' },
      { icon: <FileDoneOutlined />, label: 'Quote', path: '/main/customers/quotes/new' },
      { icon: <AppstoreOutlined />, label: 'Product / Service', path: '/main/inventory/items' },
    ],
  },
  {
    title: 'Expenses',
    entries: [
      { icon: <ShoppingCartOutlined />, label: 'Bill', path: '/main/vendors/bills/enter' },
      { icon: <DollarOutlined />, label: 'Expense', path: '/main/expenses/create' },
      { icon: <ShopOutlined />, label: 'Vendor / Supplier', path: '/main/expenses/suppliers' },
      { icon: <CreditCardOutlined />, label: 'Credit Card Charge', path: '/main/expenses/credit-cards' },
    ],
  },
  {
    title: 'Banking',
    entries: [
      { icon: <BankOutlined />, label: 'Deposit', path: '/main/banking/deposits' },
      { icon: <FormOutlined />, label: 'Check', path: '/main/accountant/check-printing' },
    ],
  },
  {
    title: 'Other',
    entries: [
      { icon: <TeamOutlined />, label: 'Employee', path: '/main/employees/center' },
      { icon: <BookOutlined />, label: 'Journal Entry', path: '/main/accountant/journal-entries' },
      { icon: <BookOutlined />, label: 'Account', path: '/main/accountant/chart-of-accounts' },
    ],
  },
];

const PopOverComponent = (
  <div style={{ padding: 8 }}>
    <Row gutter={[24, 16]}>
      {items.map(group => (
        <Col span={12} key={group.title}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1890ff', marginBottom: 8, borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>{group.title}</div>
          {group.entries.map((item, i) => (
            <Link key={i} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, color: '#595959', textDecoration: 'none', fontSize: 13, transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e6f7ff'; e.currentTarget.style.color = '#1890ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#595959'; }}>
              <span style={{ fontSize: 14, color: '#8c8c8c' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </Col>
      ))}
    </Row>
  </div>
);

export default PopOverComponent;
