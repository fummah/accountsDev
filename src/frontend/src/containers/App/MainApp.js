import React, {useEffect, useState} from "react";
import {Layout, Modal} from "antd";
import {useDispatch, useSelector} from "react-redux";
import SetupWizard from "../../components/settings/SetupWizard";
import HorizontalDefault from "../Topbar/HorizontalDefault/index";
import HorizontalDark from "../Topbar/HorizontalDark/index";
import InsideHeader from "../Topbar/InsideHeader/index";
import AboveHeader from "../Topbar/AboveHeader/index";

import BelowHeader from "../Topbar/BelowHeader/index";
import Topbar from "../Topbar/index";
import App from "../../routes/index";
import Customizer from "../Customizer";
import {
  NAV_STYLE_ABOVE_HEADER,
  NAV_STYLE_BELOW_HEADER,
  NAV_STYLE_DARK_HORIZONTAL,
  NAV_STYLE_DEFAULT_HORIZONTAL,
  NAV_STYLE_DRAWER,
  NAV_STYLE_FIXED,
  NAV_STYLE_INSIDE_HEADER_HORIZONTAL,
  NAV_STYLE_MINI_SIDEBAR,
  NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR,
  NAV_STYLE_NO_HEADER_MINI_SIDEBAR
} from "../../constants/ThemeSetting";
import NoHeaderNotification from "../Topbar/NoHeaderNotification/index";
import {useRouteMatch} from "react-router-dom";
import {updateWindowWidth} from "../../appRedux/actions";
import AppSidebar from "./AppSidebar";
import CommandPalette from "../../components/CommandPalette";
import { loadBaseCurrency } from "../../utils/currency";
import KeyboardShortcuts from "../../components/shared/KeyboardShortcuts";
import HelpCenter from "../../components/shared/HelpCenter";

const {Content, Footer} = Layout;

const getContainerClass = (navStyle) => {
  switch (navStyle) {
    case NAV_STYLE_DARK_HORIZONTAL:
      return "gx-container-wrap";
    case NAV_STYLE_DEFAULT_HORIZONTAL:
      return "gx-container-wrap";
    case NAV_STYLE_INSIDE_HEADER_HORIZONTAL:
      return "gx-container-wrap";
    case NAV_STYLE_BELOW_HEADER:
      return "gx-container-wrap";
    case NAV_STYLE_ABOVE_HEADER:
      return "gx-container-wrap";
    default:
      return '';
  }
};

const getNavStyles = (navStyle) => {
  switch (navStyle) {
    case NAV_STYLE_DEFAULT_HORIZONTAL :
      return <HorizontalDefault/>;
    case NAV_STYLE_DARK_HORIZONTAL :
      return <HorizontalDark/>;
    case NAV_STYLE_INSIDE_HEADER_HORIZONTAL :
      return <InsideHeader/>;
    case NAV_STYLE_ABOVE_HEADER :
      return <AboveHeader/>;
    case NAV_STYLE_BELOW_HEADER :
      return <BelowHeader/>;
    case NAV_STYLE_FIXED :
      return <Topbar/>;
    case NAV_STYLE_DRAWER :
      return <Topbar/>;
    case NAV_STYLE_MINI_SIDEBAR :
      return <Topbar/>;
    case NAV_STYLE_NO_HEADER_MINI_SIDEBAR :
      return <NoHeaderNotification/>;
    case NAV_STYLE_NO_HEADER_EXPANDED_SIDEBAR :
      return <NoHeaderNotification/>;
    default :
      return null;
  }
};

const MainApp = () => {
  const {navStyle} = useSelector(({settings}) => settings);
  const match = useRouteMatch();
  const dispatch = useDispatch();
  const [companyName, setCompanyName] = useState('');
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  useEffect(() => {
    window.addEventListener('resize', () => {
      dispatch(updateWindowWidth(window.innerWidth));
    });
    loadBaseCurrency();
    (async () => {
      try {
        const info = await window.electronAPI?.getCompany?.();
        if (info?.name) {
          setCompanyName(info.name);
        } else {
          setOnboardingVisible(true);
        }
      } catch {}
    })();
  }, [dispatch]);

  const year = new Date().getFullYear();

  return (
    <Layout className="gx-app-layout">
      <AppSidebar navStyle={navStyle}/>
      <Layout>
        {getNavStyles(navStyle)}
        <Content className={`gx-layout-content ${getContainerClass(navStyle)} `}>
          <App match={match}/>
          <Footer>
            <div className="gx-layout-footer-content">
              Copyright {companyName || 'Company Name'} &copy; {year}
            </div>
          </Footer>
        </Content>
      </Layout>
      <Customizer/>
      <CommandPalette/>
      <KeyboardShortcuts />
      <HelpCenter />

      <Modal
        visible={onboardingVisible}
        closable={false}
        maskClosable={false}
        footer={null}
        width="90vw"
        style={{ top: 0, padding: 0, maxWidth: 1100 }}
        bodyStyle={{ padding: 0, borderRadius: 12, overflow: 'hidden', minHeight: 600 }}
        destroyOnClose
      >
        <SetupWizard
          modal
          onComplete={async () => {
            try {
              const info = await window.electronAPI?.getCompany?.();
              if (info?.name) setCompanyName(info.name);
            } catch {}
            setOnboardingVisible(false);
          }}
        />
      </Modal>
    </Layout>
  )
};
export default MainApp;

