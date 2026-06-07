import React from "react";
import {Menu,Button,Popover} from "antd";
import {Link} from "react-router-dom";

import CustomScrollbars from "util/CustomScrollbars";
import SidebarLogo from "./SidebarLogo";
import PopOverComponent from "./PopOverComponent";
import {
  NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR,
  NAV_STYLE_NO_HEADER_MINI_SIDEBAR,
  THEME_TYPE_LITE
} from "../../constants/ThemeSetting";
import IntlMessages from "../../util/IntlMessages";
import {useSelector} from "react-redux";
import {  PlusOutlined,} from '@ant-design/icons';

const MenuItemGroup = Menu.ItemGroup;


const SidebarContent = ({sidebarCollapsed, setSidebarCollapsed}) => {
  const {navStyle, themeType} = useSelector(({settings}) => settings);
  const pathname = useSelector(({common}) => common.pathname);
  const width = useSelector(({common}) => common.width);

  const getNoHeaderClass = (navStyle) => {
    if (navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR || navStyle === NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR) {
      return "gx-no-header-notifications";
    }
    return "";
  };
  

  const selectedKeys = pathname.substr(1);

  const collapsedLayoutCSS = `
    .sidebar-collapsed-mode .ant-menu-item-group-title { display: none !important; }
    .sidebar-collapsed-mode .ant-menu-item {
      padding: 0 28px !important;
      text-align: center !important;
    }
    .sidebar-collapsed-mode i[class*="icon"] {
      margin-right: 0 !important;
      font-size: 20px !important;
    }
  `;

  return (
    <>
      {sidebarCollapsed && <style>{collapsedLayoutCSS}</style>}
      <SidebarLogo sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed}/>
      <div className={`gx-sidebar-content ${sidebarCollapsed ? 'sidebar-collapsed-mode' : ''}`}>
        {!sidebarCollapsed && (
          <div className={`gx-sidebar-notifications ${getNoHeaderClass(navStyle)}`}>
            <div style={{ padding: '1px' }}>
              <Popover content={PopOverComponent} trigger="click" placement="rightTop" overlayStyle={{ width: 800 }}>
                <Button type="primary" icon={<PlusOutlined />} block style={{ marginBottom: '16px', backgroundColor: '#2ca01c', borderColor: '#2ca01c' }}>
                  New
                </Button>
              </Popover>
            </div>
          </div>
        )}
        <CustomScrollbars className="gx-layout-sider-scrollbar">
          <Menu
            selectedKeys={[selectedKeys]}
            theme={themeType === THEME_TYPE_LITE ? 'lite' : 'dark'}
            mode="inline"
            inlineCollapsed={sidebarCollapsed}>

            {/* ── Dashboard ── */}
            <MenuItemGroup key="main" className="gx-menu-group" title={!sidebarCollapsed && <IntlMessages id="accounts.menu"/>}>
              <Menu.Item key="main/dashboard/home-dash">
                <Link to="/main/dashboard/home-dash">
                  <i className="icon icon-dasbhoard"/>
                  {!sidebarCollapsed && <span><IntlMessages id="sidebar.dashboard"/></span>}
                </Link>
              </Menu.Item>
            </MenuItemGroup>

            {/* ── Activities ── */}
            <MenuItemGroup key="in-built-apps" className="gx-menu-group" title={!sidebarCollapsed && <IntlMessages id="accounts.activities"/>}>

              {/* Sales */}
              <Menu.Item key="inner/sales">
                <Link to="/inner/sales">
                  <i className="icon icon-crm"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.sales"/></span>}
                </Link>
              </Menu.Item>
              <Menu.Item key="inner/invoices">
                <Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}>
                  <i className="icon icon-orders"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.invoices"/></span>}
                </Link>
              </Menu.Item>
              <Menu.Item key="inner/customers">
                <Link to={{ pathname: "/inner/sales", state: { tabKey: "9" } }}>
                  <i className="icon icon-profile2"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.customers"/></span>}
                </Link>
              </Menu.Item>

              {/* Expenses */}
              <Menu.Item key="main/expenses/tracking">
                <Link to="/main/expenses/tracking">
                  <i className="icon icon-contacts"/>
                  {!sidebarCollapsed && <span>Expenses &amp; Bills</span>}
                </Link>
              </Menu.Item>
              <Menu.Item key="main/expenses/suppliers">
                <Link to="/main/expenses/suppliers">
                  <i className="icon icon-user"/>
                  {!sidebarCollapsed && <span>Suppliers / Vendors</span>}
                </Link>
              </Menu.Item>

              {/* Banking */}
              <Menu.Item key="inner/transactions">
                <Link to="/inner/transactions">
                  <i className="icon icon-card"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.transactions"/></span>}
                </Link>
              </Menu.Item>
              <Menu.Item key="main/banking/reconcile">
                <Link to="/main/banking/reconcile">
                  <i className="icon icon-check-square-o"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.reconcile"/></span>}
                </Link>
              </Menu.Item>

              {/* VAT */}
              <Menu.Item key="inner/vat">
                <Link to="/inner/vat">
                  <i className="icon icon-inbuilt-apps"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.vat"/></span>}
                </Link>
              </Menu.Item>

              {/* Employees */}
              <Menu.Item key="main/employees/center">
                <Link to="/main/employees/center">
                  <i className="icon icon-profile2"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.employees"/></span>}
                </Link>
              </Menu.Item>

              {/* Reports */}
              <Menu.Item key="inner/reports">
                <Link to="/inner/reports">
                  <i className="icon icon-chart"/>
                  {!sidebarCollapsed && <span><IntlMessages id="accounts.reports"/></span>}
                </Link>
              </Menu.Item>

              {/* Inventory */}
              <Menu.Item key="main/inventory/stock">
                <Link to="/main/inventory/stock">
                  <i className="icon icon-shopping-cart"/>
                  {!sidebarCollapsed && <span>Inventory</span>}
                </Link>
              </Menu.Item>

              {/* Projects */}
              <Menu.Item key="main/projects/center">
                <Link to="/main/projects/center">
                  <i className="icon icon-widgets"/>
                  {!sidebarCollapsed && <span>Projects</span>}
                </Link>
              </Menu.Item>

              {/* POS */}
              <Menu.Item key="main/pos/session">
                <Link to="/main/pos/session">
                  <i className="icon icon-orders"/>
                  {!sidebarCollapsed && <span>Point of Sale</span>}
                </Link>
              </Menu.Item>

              {/* CRM */}
              <Menu.Item key="main/customers/leads">
                <Link to="/main/customers/leads">
                  <i className="icon icon-all-contacts"/>
                  {!sidebarCollapsed && <span>CRM</span>}
                </Link>
              </Menu.Item>

              {/* Bank Statements */}
              <Menu.Item key="main/bank-statements/list">
                <Link to="/main/bank-statements/list">
                  <i className="icon icon-card"/>
                  {!sidebarCollapsed && <span>Bank Statements</span>}
                </Link>
              </Menu.Item>

              <Menu.Item key="main/analytics">
                <Link to="/main/analytics">
                  <i className="icon icon-chart-area-new"/>
                  {!sidebarCollapsed && <span>Analytics</span>}
                </Link>
              </Menu.Item>

              <Menu.Item key="inner/profile">
                <Link to="/inner/profile">
                  <i className="icon icon-user"/>
                  {!sidebarCollapsed && <span>Profile</span>}
                </Link>
              </Menu.Item>

            </MenuItemGroup>
          </Menu>
        </CustomScrollbars>
      </div>
    </>
  );
};

export default React.memo(SidebarContent);

