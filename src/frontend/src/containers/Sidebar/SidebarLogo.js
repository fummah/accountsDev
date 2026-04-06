import React, {useEffect, useState} from "react";
import {useSelector} from "react-redux";
import {Link} from "react-router-dom";
import {
  NAV_STYLE_DRAWER,
  NAV_STYLE_FIXED,
  NAV_STYLE_MINI_SIDEBAR,
  NAV_STYLE_NO_HEADER_MINI_SIDEBAR,
  TAB_SIZE,
  THEME_TYPE_LITE
} from "../../constants/ThemeSetting";


const SidebarLogo = ({sidebarCollapsed, setSidebarCollapsed}) => {
  const {width, themeType} = useSelector(({settings}) => settings);
  let navStyle = useSelector(({settings}) => settings.navStyle);
  const [companyLogo, setCompanyLogo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const info = await window.electronAPI?.getCompany?.();
        if (info?.logo && typeof info.logo === 'string' && info.logo.startsWith('data:')) {
          setCompanyLogo(info.logo);
        }
      } catch {}
    })();
  }, []);

  const isMobile = width < TAB_SIZE;
  if (isMobile && navStyle === NAV_STYLE_FIXED) {
    navStyle = NAV_STYLE_DRAWER;
  }

  const logoImg = companyLogo
    ? <img alt="logo" src={companyLogo} style={{ height: 36, maxWidth: 140, objectFit: 'contain' }} />
    : navStyle === NAV_STYLE_NO_HEADER_MINI_SIDEBAR && !isMobile
      ? <img alt="logo" src={"/assets/images/w-logo.png"} style={{ height: 36, maxWidth: 140, objectFit: 'contain' }} />
      : themeType === THEME_TYPE_LITE
        ? <img alt="logo" src={"/assets/images/logo.png"} style={{ height: 36, maxWidth: 140, objectFit: 'contain' }} />
        : <img alt="logo" src={"/assets/images/logo-white.png"} style={{ height: 36, maxWidth: 140, objectFit: 'contain' }} />;

  // Show fold/unfold toggle on desktop only (mobile uses the Drawer close button)
  const showToggle = !isMobile && (navStyle === NAV_STYLE_FIXED || navStyle === NAV_STYLE_MINI_SIDEBAR);

  return (
    <div className="gx-layout-sider-header">
      {showToggle ? <div className="gx-linebar">
        <i
          className={`gx-icon-btn icon icon-${sidebarCollapsed ? 'menu-fold' : 'menu-unfold'} ${themeType !== THEME_TYPE_LITE ? 'gx-text-white' : ''}`}
          onClick={() => {
            if (typeof setSidebarCollapsed === 'function') setSidebarCollapsed();
          }}
        />
      </div> : null}

      <Link to="/" className="gx-site-logo">
        {sidebarCollapsed ? null : logoImg}
      </Link>
    </div>
  );
};

export default SidebarLogo;
