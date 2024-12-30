import React from "react";
import {useSelector} from "react-redux";
import {Menu} from "antd";
import {Link} from "react-router-dom";
import IntlMessages from "../../util/IntlMessages";
import {
  NAV_STYLE_ABOVE_HEADER,
  NAV_STYLE_BELOW_HEADER,
  NAV_STYLE_DEFAULT_HORIZONTAL,
  NAV_STYLE_INSIDE_HEADER_HORIZONTAL
} from "../../constants/ThemeSetting";

const SubMenu = Menu.SubMenu;
const MenuItemGroup = Menu.ItemGroup;

const HorizontalNav = () => {
  const navStyle = useSelector(({settings}) => settings.navStyle);
  const pathname = useSelector(({common}) => common.pathname);

  const getNavStyleSubMenuClass = (navStyle) => {
    switch (navStyle) {
      case NAV_STYLE_DEFAULT_HORIZONTAL:
        return "gx-menu-horizontal gx-submenu-popup-curve";
      case NAV_STYLE_INSIDE_HEADER_HORIZONTAL:
        return "gx-menu-horizontal gx-submenu-popup-curve gx-inside-submenu-popup-curve";
      case NAV_STYLE_BELOW_HEADER:
        return "gx-menu-horizontal gx-submenu-popup-curve gx-below-submenu-popup-curve";
      case NAV_STYLE_ABOVE_HEADER:
        return "gx-menu-horizontal gx-submenu-popup-curve gx-above-submenu-popup-curve";
      default:
        return "gx-menu-horizontal";
    }
  };

  const selectedKeys = pathname.substr(1);
  const defaultOpenKeys = selectedKeys.split('/')[1];
  return (
    <Menu
      defaultOpenKeys={[defaultOpenKeys]}
      selectedKeys={[selectedKeys]}
      mode="horizontal">
      <SubMenu popupClassName={getNavStyleSubMenuClass(navStyle)} key="main" title={<IntlMessages id="sidebar.main"/>}>
        <SubMenu popupClassName="gx-menu-horizontal" key="dashboard" title={
          <span>
            <i className="icon icon-dasbhoard"/>
            <IntlMessages id="sidebar.dashboard"/>
          </span>
        }>
          <Menu.Item key="main/dashboard/home">
                  <Link to="/main/dashboard/home">
                    <i className="icon icon-home"/>
                    <span><IntlMessages id="aid.home"/></span>
                  </Link>
                </Menu.Item> 
        </SubMenu>

      </SubMenu>

      <SubMenu popupClassName={getNavStyleSubMenuClass(navStyle)} key="activity"
               title={<IntlMessages id="aid.activity"/>}>

<Menu.Item key="lists/claims">
                <Link to="/lists/claims"><i className="icon icon-crm"/><span><IntlMessages
                  id="aid.claims"/></span></Link>
              </Menu.Item>

              <Menu.Item key="lists/policyholders">
                <Link to="/lists/policyholders"><i
                  className="icon icon-avatar"/><span><IntlMessages
                  id="aid.policyholders"/></span></Link>
              </Menu.Item>

              <Menu.Item key="lists/doctors">
                <Link to="/lists/doctors"><i className="icon icon-contacts"/><span><IntlMessages
                  id="aid.doctors"/></span></Link>
              </Menu.Item>

              <Menu.Item key="lists/coding">
                <Link to="/lists/coding"><i
                  className="icon icon-check-square-o -flex-column-reverse"/><span><IntlMessages
                  id="aid.coding"/></span></Link>
              </Menu.Item>

      </SubMenu>

      <SubMenu popupClassName={getNavStyleSubMenuClass(navStyle)} key="admin"
               title={<IntlMessages id="aid.admin"/>}>

        <SubMenu popupClassName="gx-menu-horizontal" key="general" title={
          <span>
                  <i className="icon icon-all-contacts"/>
                   <IntlMessages id="aid.admin"/>
              </span>}>
              <Menu.Item key="lists/products">
                <Link to="/lists/products">
                  <i className="icon icon-folder -flex-column-reverse"/>
                  <span><IntlMessages id="aid.products"/></span>
                </Link>
              </Menu.Item>
              <Menu.Item key="lists/users">
                <Link to="/lists/users">
                  <i className="icon icon-profile2"/>
                  <span><IntlMessages id="aid.users"/></span>
                </Link>
              </Menu.Item>
        </SubMenu>       

      </SubMenu>

    </Menu>

  );
};

HorizontalNav.propTypes = {};

export default HorizontalNav;

