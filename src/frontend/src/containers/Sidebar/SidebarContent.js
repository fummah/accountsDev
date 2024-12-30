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

const SubMenu = Menu.SubMenu;
const MenuItemGroup = Menu.ItemGroup;


const SidebarContent = ({sidebarCollapsed, setSidebarCollapsed}) => {
  const {navStyle, themeType} = useSelector(({settings}) => settings);
  const pathname = useSelector(({common}) => common.pathname);

  const getNoHeaderClass = (navStyle) => {
    if (navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR || navStyle === NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR) {
      return "gx-no-header-notifications";
    }
    return "";
  };
  const getNavStyleSubMenuClass = (navStyle) => {
    if (navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR) {
      return "gx-no-header-submenu-popup";
    }
    return "";
  };
  

  const selectedKeys = pathname.substr(1);
  const defaultOpenKeys = selectedKeys.split('/')[1];

  return (
    <>
      <SidebarLogo sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed}/>
      <div className="gx-sidebar-content">
        <div className={`gx-sidebar-notifications ${getNoHeaderClass(navStyle)}`}>
        <div style={{ padding: '1px' }}>
        <Popover
            content={PopOverComponent}
            trigger="click"
            placement="rightTop"
            overlayStyle={{ width: 800 }}
          >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            block
            style={{
              marginBottom: '16px',
              backgroundColor: '#2ca01c',
              borderColor: '#2ca01c',
            }}
          >
            New
          </Button>
          </Popover>
        </div>
        </div>
        <CustomScrollbars className="gx-layout-sider-scrollbar">
          <Menu
            defaultOpenKeys={[defaultOpenKeys]}
            selectedKeys={[selectedKeys]}
            theme={themeType === THEME_TYPE_LITE ? 'lite' : 'dark'}
            mode="vertical">

            <MenuItemGroup key="main" className="gx-menu-group" title={<IntlMessages id="accounts.menu"/>}>
              <SubMenu key="dashboard" popupClassName={getNavStyleSubMenuClass(navStyle)}
                       title={
                     
<span>
<i className="icon icon-dasbhoard" />
<Link to="/main/dashboard/home">
  <span>
    <IntlMessages id="sidebar.dashboard" />
  </span>
</Link>
</span>

                        }>
                <Menu.Item key="main/dashboard/home">
                  <Link to={{ pathname: "/main/dashboard/home", state: { tabKey: "1" } }}>
                    <i className="icon icon-home"/>
                    <span><IntlMessages id="accounts.home"/></span>
                  </Link>
                  </Menu.Item>
                  <Menu.Item key="main/dashboard/home1">
                  <Link to={{ pathname: "/main/dashboard/home", state: { tabKey: "2" } }}>
                    <i className="icon icon-revenue-new"/>
                    <span><IntlMessages id="accounts.cashflow"/></span>
                  </Link>
                  </Menu.Item>
                                
              </SubMenu>
             
            </MenuItemGroup>

            <MenuItemGroup key="in-built-apps" className="gx-menu-group" title={<IntlMessages id="accounts.activities"/>}>
                          <SubMenu
  key="sales"
  popupClassName={getNavStyleSubMenuClass(navStyle)}
  title={
    <span>
      <i className="icon icon-crm" />
      <Link to="/inner/sales">
        <span>
          <IntlMessages id="accounts.sales" />
        </span>
      </Link>
    </span>
  }
>
  <Menu.Item key="inner/sales">
    <Link to={{ pathname: "/inner/sales", state: { tabKey: "1" } }}>
      <i className="icon icon-lising-dbrd" />
      <span>
        <IntlMessages id="accounts.allsales" />
      </span>
    </Link>
  </Menu.Item>
  <Menu.Item key="inner/invoices">
    <Link to={{ pathname: "/inner/sales", state: { tabKey: "2" } }}>
      <i className="icon icon-orders" />
      <span>
        <IntlMessages id="accounts.invoices" />
      </span>
    </Link>
  </Menu.Item>
  <Menu.Item key="inner/quotes">
    <Link to={{ pathname: "/inner/sales", state: { tabKey: "3" } }}>
      <i className="icon icon-crm" />
      <span>Quotes</span>
    </Link>
  </Menu.Item>
  <Menu.Item key="inner/customers">
    <Link to={{ pathname: "/inner/sales", state: { tabKey: "4" } }}>
      <i className="icon icon-profile2" />
      <span>
        <IntlMessages id="accounts.customers" />
      </span>
    </Link>
  </Menu.Item>
  <Menu.Item key="inner/products">
    <Link to={{ pathname: "/inner/sales", state: { tabKey: "5" } }}>
      <i className="icon icon-view-o" />
      <span>
        <IntlMessages id="accounts.productsandservices" />
      </span>
    </Link>
  </Menu.Item>
</SubMenu>

             <SubMenu key="expenses" popupClassName={getNavStyleSubMenuClass(navStyle)}
                       title={
<span>
<i className="icon icon-contacts" />
<Link to="/inner/expenses">
  <span>
    <IntlMessages id="accounts.expenses" />
  </span>
</Link>
</span>
                        }>
                         <Menu.Item key="inner/expenses">
                         <Link to={{ pathname: "/inner/expenses", state: { tabKey: "1" } }}>
                <i className="icon icon-contacts"/><span><IntlMessages
                  id="accounts.expenses"/></span></Link>
              </Menu.Item>
              <Menu.Item key="lists/policyholders0">
              <Link to={{ pathname: "/inner/expenses", state: { tabKey: "2" } }}>
                <i className="icon icon-user"/><span><IntlMessages
                  id="accounts.suppliers"/></span></Link>
              </Menu.Item>             
</SubMenu>

<SubMenu key="customersandleads" popupClassName={getNavStyleSubMenuClass(navStyle)}
                       title={                     
  <span>
  <i className="icon icon-all-contacts" />
  <Link to="/inner/customersleads">
    <span>
      <IntlMessages id="accounts.customersandleads" />
    </span>
  </Link>
</span>
                        }>
              <Menu.Item key="inner/customersleads">
              <Link to={{ pathname: "/inner/customersleads", state: { tabKey: "1" } }}><i
                  className="icon icon-all-contacts"/><span><IntlMessages
                  id="accounts.customers"/></span></Link>
              </Menu.Item>
             
              </SubMenu>
              <SubMenu key="transactions" popupClassName={getNavStyleSubMenuClass(navStyle)}
                       title={
                    

<span>
<i className="icon icon-card" />
<Link to="/inner/transactions">
  <span>
    <IntlMessages id="accounts.transactions" />
  </span>
</Link>
</span>
                        }>
            
              <Menu.Item key="inner/receipts">
              <Link to={{ pathname: "/inner/transactions", state: { tabKey: "1" } }}>
                <i className="icon icon-folder-o"/>
                <span><IntlMessages
                  id="accounts.receipts"/></span>
                  </Link>
              </Menu.Item>
              <Menu.Item key="lists/claims3">
              <Link to={{ pathname: "/inner/transactions", state: { tabKey: "2" } }}>
                <i className="icon icon icon-check-square-o -flex-column-reverse"/><span><IntlMessages
                  id="accounts.reconcile"/></span></Link>
              </Menu.Item>
           
              </SubMenu>

             
            
              <Menu.Item key="inner/vat">
                <Link to="/inner/vat"><i
                  className="icon icon-inbuilt-apps"/><span><IntlMessages
                  id="accounts.vat"/></span></Link>
              </Menu.Item>
             
              <Menu.Item key="inner/employees">
                <Link to="/inner/employees">
                  <i className="icon icon-profile2"/>
                  <span><IntlMessages id="accounts.employees"/></span>
                </Link>
              </Menu.Item>
              <Menu.Item key="inner/reports">
                <Link to="/inner/reports"><i
                  className="icon icon-chart"/><span><IntlMessages
                  id="accounts.reports"/></span></Link>
              </Menu.Item>
              <Menu.Item key="inner/profile">
                <Link to="/inner/profile"><i
                  className="icon icon-user"/><span>Profile</span></Link>
              </Menu.Item>
            </MenuItemGroup>
          </Menu>
        </CustomScrollbars>
      </div>
    </>
  );
};

export default React.memo(SidebarContent);

