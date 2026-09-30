import React, { useState } from "react";
import {Menu,Button,Popover} from "antd";
import {Link} from "react-router-dom";

import CustomScrollbars from "util/CustomScrollbars";
import SidebarLogo from "./SidebarLogo";
import PopOverComponent from "./PopOverComponent";
import {
  NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR,
  NAV_STYLE_NO_HEADER_MINI_SIDEBAR
} from "../../constants/ThemeSetting";
import IntlMessages from "../../util/IntlMessages";
import {useSelector} from "react-redux";
import { PlusOutlined, DatabaseOutlined, HomeOutlined, BarcodeOutlined, SlidersOutlined, CalculatorOutlined } from '@ant-design/icons';

const MenuItemGroup = Menu.ItemGroup;
const SubMenu = Menu.SubMenu;

const SidebarContent = ({sidebarCollapsed, setSidebarCollapsed}) => {
  const [popoverVisible, setPopoverVisible] = useState(false);
  const {navStyle} = useSelector(({settings}) => settings);
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
              <Popover content={<PopOverComponent onClose={() => setPopoverVisible(false)} />} trigger="click" placement="rightTop" overlayStyle={{ width: 800 }} visible={popoverVisible} onVisibleChange={setPopoverVisible}>
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
            theme="dark"
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
                <Menu.Item key="main/customers/quotes/list">
                  <Link to="/main/customers/quotes/list">
                    <i className="icon icon-orders"/>
                    <span>Quotes</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/customers/invoices/list">
                  <Link to="/main/customers/invoices/list">
                    <i className="icon icon-orders"/>
                    <span><IntlMessages id="accounts.invoices"/></span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/customers/payments">
                  <Link to="/main/customers/payments">
                    <i className="icon icon-check-square-o"/>
                    <span>Payments</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/customers/center">
                  <Link to="/main/customers/center">
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
                <Menu.Item key="main/vendors/purchasing/dashboard">
                  <Link to="/main/vendors/purchasing/dashboard">
                    <i className="icon icon-listing-dbrd"/>
                    <span>Purchasing Dashboard</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/vendors/bills/tracker">
                  <Link to="/main/vendors/bills/tracker">
                    <i className="icon icon-contacts"/>
                    <span>Bill Management</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/vendors/bills/enter">
                  <Link to="/main/vendors/bills/enter">
                    <i className="icon icon-editor"/>
                    <span>Enter Bill</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/vendors/purchasing/purchase-orders">
                  <Link to="/main/vendors/purchasing/purchase-orders">
                    <i className="icon icon-shopping-cart"/>
                    <span>Purchase Orders</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/vendors/bills/pay">
                  <Link to="/main/vendors/bills/pay">
                    <i className="icon icon-check-square-o"/>
                    <span>Pay Bills</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/expenses/credit-cards">
                  <Link to="/main/expenses/credit-cards">
                    <i className="icon icon-card"/>
                    <span>Credit Card Charges</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/accountant/check-printing">
                  <Link to="/main/accountant/check-printing">
                    <i className="icon icon-editor"/>
                    <span>Write Check</span>
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
                <Menu.Item key="main/banking/deposits">
                  <Link to="/main/banking/deposits">
                    <i className="icon icon-card"/>
                    <span>Make Deposits</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* Inventory sub-group — own top-level menu */}
              <SubMenu key="sub-inventory" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-shopping-cart"/><span>Inventory</span></span>
              }>
                <Menu.Item key="main/inventory/dashboard">
                  <Link to="/main/inventory/dashboard"><i className="icon icon-listing-dbrd"/><span>Dashboard</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/reorder">
                  <Link to="/main/inventory/reorder"><i className="icon icon-alert"/><span>Reorder Needed</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/movement-report">
                  <Link to="/main/inventory/movement-report"><i className="icon icon-chart"/><span>Movement Report</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/profitability">
                  <Link to="/main/inventory/profitability"><i className="icon icon-revenue-new"/><span>Item Profitability</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/items">
                  <Link to="/main/inventory/items"><i className="icon icon-apps"/><span>Products &amp; Services</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/stock">
                  <Link to="/main/inventory/stock"><i className="icon icon-shopping-cart"/><span>Stock Levels</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/warehouses">
                  <Link to="/main/inventory/warehouses"><i className="icon icon-home"/><span>Warehouses</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/bom">
                  <Link to="/main/inventory/bom"><i className="icon icon-widgets"/><span>Bill of Materials</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/serials">
                  <Link to="/main/inventory/serials"><i className="icon icon-alert"/><span>Serial Numbers</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/barcodes">
                  <Link to="/main/inventory/barcodes"><i className="icon icon-tag"/><span>Barcodes</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/adjustments">
                  <Link to="/main/inventory/adjustments"><i className="icon icon-card"/><span>Adjustments</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/pricing-rules">
                  <Link to="/main/inventory/pricing-rules"><i className="icon icon-check-square-o"/><span>Pricing Rules</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/pick-pack-ship">
                  <Link to="/main/inventory/pick-pack-ship"><i className="icon icon-orders"/><span>Pick &#38; Pack &#38; Ship</span></Link>
                </Menu.Item>
                <Menu.Item key="main/inventory/alerts">
                  <Link to="/main/inventory/alerts"><i className="icon icon-alert"/><span>Inventory Alerts</span></Link>
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
                <Menu.Item key="main/accountant/general-ledger">
                  <Link to="/main/accountant/general-ledger">
                    <i className="icon icon-listing-dbrd"/>
                    <span>General Ledger</span>
                  </Link>
                </Menu.Item>
                <Menu.Item key="main/reports/sales">
                  <Link to="/main/reports/sales">
                    <i className="icon icon-revenue-new"/>
                    <span>Sales Report</span>
                  </Link>
                </Menu.Item>
              </SubMenu>

              {/* More sub-group */}
              <SubMenu key="sub-more" popupClassName="gx-menu-horizontal" title={
                <span><i className="icon icon-widgets"/><span>More</span></span>
              }>
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
                <Menu.Item key="main/dashboard/company">
                  <Link to="/main/dashboard/company">
                    <i className="icon icon-setting"/>
                    <span>My Company Settings</span>
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

