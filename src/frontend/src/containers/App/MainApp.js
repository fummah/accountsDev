import React, {useEffect, useState} from "react";
import {Layout, Modal, Form, Input, Upload, Button, message as antMsg} from "antd";
import {UploadOutlined} from "@ant-design/icons";
import {useDispatch, useSelector} from "react-redux";
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
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardLogo, setOnboardLogo] = useState(null);
  const [onboardForm] = Form.useForm();

  useEffect(() => {
    window.addEventListener('resize', () => {
      dispatch(updateWindowWidth(window.innerWidth));
    });
    // Fetch company info for footer + onboarding check
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

  const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

  const handleOnboardingSave = async () => {
    try {
      const vals = await onboardForm.validateFields();
      setOnboardingSaving(true);
      // Send only the fields we need — all as plain strings/numbers
      const payload = {
        name: String(vals.companyName || ''),
        logo: typeof onboardLogo === 'string' ? onboardLogo : '',
      };
      const res = await window.electronAPI?.saveCompany?.(payload);
      if (res?.success) {
        setCompanyName(vals.companyName);
        setOnboardingVisible(false);
        antMsg.success('Company profile saved! Welcome to the system.');
      } else {
        antMsg.error('Failed to save company info');
      }
    } catch (e) {
      if (!e?.errorFields) antMsg.error('Please fill in the required fields');
    }
    setOnboardingSaving(false);
  };

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

      <Modal
        title="Welcome! Let's set up your company"
        visible={onboardingVisible}
        closable={false}
        maskClosable={false}
        footer={[
          <Button key="save" type="primary" loading={onboardingSaving} onClick={handleOnboardingSave}>
            Get Started
          </Button>
        ]}
        width={500}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          Please provide your company name to get started. You can also upload a logo now or later in <strong>Company Settings</strong>.
        </p>
        <Form form={onboardForm} layout="vertical">
          <Form.Item name="companyName" label="Company Name" rules={[{ required: true, message: 'Company name is required to continue' }]}>
            <Input placeholder="e.g. My Business Pty Ltd" size="large" />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Company Logo (optional)</label>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={async (file) => {
                try {
                  const b64 = await getBase64(file);
                  setOnboardLogo(b64);
                  antMsg.success(`${file.name} uploaded`);
                } catch { antMsg.error('Upload failed'); }
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>Click to Upload Logo</Button>
            </Upload>
          </div>
          {onboardLogo && (
            <div style={{ marginBottom: 16 }}>
              <img src={onboardLogo} alt="Logo preview"
                style={{ maxHeight: 60, maxWidth: 160, objectFit: 'contain', border: '1px solid #e8e8e8', borderRadius: 4, padding: 4 }} />
            </div>
          )}
        </Form>
      </Modal>
    </Layout>
  )
};
export default MainApp;

