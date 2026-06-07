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
import { PlusOutlined } from '@ant-design/icons';

const MenuItemGroup = Menu.ItemGroup;
const SubMenu = Menu.SubMenu;

const SidebarContent = ({sidebarCollapsed, setSidebarCollapsed}) => {
  const {navStyle, themeType} = useSelector(({settings}) => settings);
  const pathname = useSelector(({common}) => common.pathname);

  const getNoHeaderClass = (navStyle) => {
    if (navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR || navStyle === NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR) {
      return "gx-no-header-notifications";
    }
    return "";
  };

  const selectedKeys = pathname.substr(1);

  // When expanded: SubMenus show inline-expanded children.
  // When collapsed: SubMenus show a hover popup (antd's default collapsed behavior).
  const menuMode = "inline";

  return (
    <>
      <SidebarLogo sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed}/>
      <div className="gx-sidebar-content">
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
            mode={menuMode}
            inlineCollapsed={sidebarCollapsed}>

            {/* ── Dashboard ── */}
            <MenuItemGroup key="grp-main" className="gx-menu-group" title={!sidebarCollapsed && <IntlMessages id="accounts.menu"/>}>
              <Menu.Item key="main/dashboard/home-dash">
                <Link to="/main/dashboard/home-dash">
                  <i className="icon icon-dasbhoard"/>
                  <span>Dashboard</span>
                </Link>
              </Menu.Item>
              <Menu.Item key="main/dashboard/home">
                <Link to="/main/dashboard/home">
                  <i className="icon icon-home"/>
                  <span>Home</span>
                </Link>
              </Menu.Item>
            </MenuItemGroup>

            {/* ── Activities ── */}
            <MenuItemGroup key="grp-activities" className="gx-menu-group" title={!sidebarCollapsed && <IntlMessages id="accounts.activities"/>}>

              {/* Sales sub-group */}
              <SubMenu key="sub-sales" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-crm"/><span>Sales</span></span>
              }>
                <Menu.Item key="inner/sales">
                  <Link to="/inner/sales">
                    <i className="icon icon-crm"/>
                    <span><IntlMessages id="accounts.sales"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="inner/invoices">
                  <Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}>
                    <i className="icon icon-orders"/>
                    <span><IntlMessages id="accounts.invoices"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="inner/customers">
                  <Link to={{ pathname: "/inner/sales", state: { tabKey: "9" } }}>
                    <i className="icon icon-profile2"/>
                    <span><IntlMessages id="accounts.customers"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/customers/leads">
                  <Link to="/main/customers/leads">
                    <i className="icon icon-all-contacts"/>
                    <span>CRM / Leads</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* Expenses sub-group */}
              <SubMenu key="sub-expenses" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-contacts"/><span>Expenses</span></span>
              }>
                <Menu.Item key="main/expenses/tracking">
                  <Link to="/main/expenses/tracking">
                    <i className="icon icon-contacts"/>
                    <span>Expenses &amp; Bills</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/expenses/suppliers">
                  <Link to="/main/expenses/suppliers">
                    <i className="icon icon-user"/>
                    <span>Suppliers / Vendors</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* Banking sub-group */}
              <SubMenu key="sub-banking" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-card"/><span>Banking</span></span>
              }>
                <Menu.Item key="inner/transactions">
                  <Link to="/inner/transactions">
                    <i className="icon icon-card"/>
                    <span><IntlMessages id="accounts.transactions"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/banking/reconcile">
                  <Link to="/main/banking/reconcile">
                    <i className="icon icon-check-square-o"/>
                    <span><IntlMessages id="accounts.reconcile"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/bank-statements/list">
                  <Link to="/main/bank-statements/list">
                    <i className="icon icon-card"/>
                    <span>Bank Statements</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* Accounting sub-group */}
              <SubMenu key="sub-accounting" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-chart"/><span>Accounting</span></span>
              }>
                <Menu.Item key="inner/reports">
                  <Link to="/inner/reports">
                    <i className="icon icon-chart"/>
                    <span><IntlMessages id="accounts.reports"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="inner/vat">
                  <Link to="/inner/vat">
                    <i className="icon icon-inbuilt-apps"/>
                    <span><IntlMessages id="accounts.vat"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/accountant/chart-of-accounts">
                  <Link to="/main/accountant/chart-of-accounts">
                    <i className="icon icon-listing-dbrd"/>
                    <span>Chart of Accounts</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/accountant/journal-entries">
                  <Link to="/main/accountant/journal-entries">
                    <i className="icon icon-editor"/>
                    <span>Journal Entries</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/accountant/trial-balance">
                  <Link to="/main/accountant/trial-balance">
                    <i className="icon icon-check-square-o"/>
                    <span>Trial Balance</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* More sub-group */}
              <SubMenu key="sub-more" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-widgets"/><span>More</span></span>
              }>
                <Menu.Item key="main/inventory/stock">
                  <Link to="/main/inventory/stock">
                    <i className="icon icon-shopping-cart"/>
                    <span>Inventory</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/employees/center">
                  <Link to="/main/employees/center">
                    <i className="icon icon-profile2"/>
                    <span><IntlMessages id="accounts.employees"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/projects/center">
                  <Link to="/main/projects/center">
                    <i className="icon icon-widgets"/>
                    <span>Projects</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/pos/session">
                  <Link to="/main/pos/session">
                    <i className="icon icon-orders"/>
                    <span>Point of Sale</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/analytics">
                  <Link to="/main/analytics">
                    <i className="icon icon-chart-area-new"/>
                    <span>Analytics</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="inner/profile">
                  <Link to="/inner/profile">
                    <i className="icon icon-user"/>
                    <span>Profile</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

            </MenuItemGroup>
          </Menu>
        </CustomScrollbars>
      </div>
    </>
  );
};

export default React.memo(SidebarContent);

