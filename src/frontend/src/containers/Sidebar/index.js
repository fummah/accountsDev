import React from "react";
import {useDispatch, useSelector} from "react-redux";
import {Drawer, Layout} from "antd";

import SidebarContent from "./SidebarContent";
import {toggleCollapsedSideNav} from "../../appRedux/actions";
import {
  NAV_STYLE_DRAWER,
  NAV_STYLE_FIXED,
  NAV_STYLE_MINI_SIDEBAR,
  NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR,
  NAV_STYLE_NO_HEADER_MINI_SIDEBAR,
  TAB_SIZE
} from "../../constants/ThemeSetting";

const {Sider} = Layout;

const Sidebar = () => {
  const navStyle = useSelector(({settings}) => settings.navStyle);
  const navCollapsed = useSelector(({common}) => common.navCollapsed);
  const width = useSelector(({common}) => common.width);
  const dispatch = useDispatch();

  const isMobile = width < TAB_SIZE;

  // Single toggle function used everywhere (hamburger, sidebar logo, drawer close)
  const toggleNav = () => {
    dispatch(toggleCollapsedSideNav(!navCollapsed));
  };

  // --- MOBILE: hidden Sider + Drawer overlay ---
  // navCollapsed: true = drawer OPEN, false = drawer CLOSED
  // LOCATION_CHANGE resets navCollapsed to false, which auto-closes drawer on navigation
  if (isMobile || navStyle === NAV_STYLE_DRAWER) {
    return (
      <Sider
        className="gx-app-sidebar gx-collapsed-sidebar gx-layout-sider-dark"
        trigger={null}
        collapsed={false}
        theme="dark"
        collapsible
        collapsedWidth={0}
        width={0}
      >
        <Drawer
          className="gx-drawer-sidebar gx-drawer-sidebar-dark"
          placement="left"
          closable={true}
          maskClosable={true}
          onClose={toggleNav}
          visible={navCollapsed}
          width={280}
          bodyStyle={{padding: 0}}
          headerStyle={{display: 'none'}}
        >
          <SidebarContent sidebarCollapsed={false} setSidebarCollapsed={toggleNav}/>
        </Drawer>
      </Sider>
    );
  }

  // --- DESKTOP: permanent Sider, collapsible via hamburger ---
  // navCollapsed: true = collapsed (icons only), false = expanded (icons + text)
  // LOCATION_CHANGE resets navCollapsed to false, expanding the sidebar on navigation
  let extraClass = "";
  if (navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR) {
    extraClass = "gx-mini-sidebar gx-mini-custom-sidebar";
  } else if (navStyle === NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR) {
    extraClass = "gx-custom-sidebar";
  } else if (navStyle === NAV_STYLE_MINI_SIDEBAR) {
    extraClass = "gx-mini-sidebar";
  }

  return (
    <Sider
      className={`gx-app-sidebar ${extraClass} gx-layout-sider-dark`}
      trigger={null}
      collapsed={navCollapsed}
      theme="dark"
      collapsible
      collapsedWidth={80}
    >
      <SidebarContent sidebarCollapsed={navCollapsed} setSidebarCollapsed={toggleNav}/>
    </Sider>
  );
};
export default Sidebar;
