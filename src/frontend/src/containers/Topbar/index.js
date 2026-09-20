import React, {useState} from "react";
import {Layout, Popover, Tooltip, AutoComplete} from "antd";
import {Link, useHistory} from "react-router-dom";
import {LeftOutlined, RightOutlined} from "@ant-design/icons";

import CustomScrollbars from "util/CustomScrollbars";
import languageData from "./languageData";
import {switchLanguage, toggleCollapsedSideNav} from "../../appRedux/actions";
import SearchBox from "../../components/SearchBox";
import UserInfo from "../../components/UserInfo";
import Auxiliary from "util/Auxiliary";


import {NAV_STYLE_DRAWER, NAV_STYLE_FIXED, NAV_STYLE_MINI_SIDEBAR, TAB_SIZE} from "../../constants/ThemeSetting";
import {useDispatch, useSelector} from "react-redux";

const {Header} = Layout;

const Topbar = () => {

  const {locale, navStyle} = useSelector(({settings}) => settings);
  const navCollapsed = useSelector(({common}) => common.navCollapsed);
  const width = useSelector(({common}) => common.width);
  const [searchText, setSearchText] = useState('');
  const [searchOptions, setSearchOptions] = useState([]);
  const dispatch = useDispatch();
  const history = useHistory();

  const languageMenu = () => (
    <CustomScrollbars className="gx-popover-lang-scroll">
      <ul className="gx-sub-popover">
        {languageData.map(language =>
          <li className="gx-media gx-pointer" key={JSON.stringify(language)} onClick={() =>
            dispatch(switchLanguage(language))
          }>
            <i className={`flag flag-24 gx-mr-2 flag-${language.icon}`}/>
            <span className="gx-language-text">{language.name}</span>
          </li>
        )}
      </ul>
    </CustomScrollbars>);

  const runSearch = async (value) => {
    const q = String(value || '').trim();
    if (!q) { setSearchOptions([]); return; }
    try {
      const res = await window.electronAPI.globalSearch?.(q);
      const results = (res && res.success && Array.isArray(res.results)) ? res.results : [];
      setSearchOptions(results.slice(0, 8).map(r => ({
        value: `${r.title}${r.subtitle ? ` — ${r.subtitle}` : ''} (${String(r.kind).replace(/-/g, ' ')})`,
        route: r.route,
      })));
    } catch (e) {
      setSearchOptions([]);
    }
  };

  const updateSearchChatUser = (evt) => {
    const v = evt.target.value;
    setSearchText(v);
    runSearch(v);
  };

  const goSearch = (value) => {
    const opt = searchOptions.find(o => o.value === value);
    if (opt && opt.route) {
      history.push(opt.route);
      setSearchText('');
      setSearchOptions([]);
    }
  };

  const searchBar = (
    <AutoComplete
      value={searchText}
      options={searchOptions}
      onSearch={setSearchText}
      onSelect={goSearch}
      onInputKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (searchOptions.length > 0) goSearch(searchOptions[0].value);
          else if (searchText.trim()) runSearch(searchText);
        }
      }}
    >
      <SearchBox styleName="gx-d-none gx-d-lg-block gx-lt-icon-search-bar-lg"
                 placeholder="Search in System..."
                 onChange={updateSearchChatUser}
                 value={searchText}/>
    </AutoComplete>
  );
  return (
    <Header>
      {(navStyle === NAV_STYLE_DRAWER || navStyle === NAV_STYLE_FIXED || navStyle === NAV_STYLE_MINI_SIDEBAR || width < TAB_SIZE) ?
        <div className="gx-linebar gx-mr-3">
          <i className="gx-icon-btn icon icon-menu"
             onClick={() => {
               dispatch(toggleCollapsedSideNav(!navCollapsed));
             }}
          />
        </div> : null}
      <Link to="/" className="gx-d-block gx-d-lg-none gx-pointer">
        <img alt="" src={(process.env.PUBLIC_URL + "/assets/images/w-logo.png")}/></Link>

      <div className="gx-d-flex gx-align-items-center gx-mr-3" style={{ gap: 2 }}>
        <Tooltip title="Back">
          <span className="gx-icon-btn gx-pointer" onClick={() => history.goBack()} style={{ fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%' }}>
            <LeftOutlined />
          </span>
        </Tooltip>
        <Tooltip title="Forward">
          <span className="gx-icon-btn gx-pointer" onClick={() => history.goForward()} style={{ fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%' }}>
            <RightOutlined />
          </span>
        </Tooltip>
      </div>

      {searchBar}
      <ul className="gx-header-notifications gx-ml-auto">
        <li className="gx-notify gx-notify-search gx-d-inline-block gx-d-lg-none">
          <Popover overlayClassName="gx-popover-horizantal" placement="bottomRight" content={
            <SearchBox styleName="gx-popover-search-bar"
                       placeholder="Search in System..."
                       onChange={updateSearchChatUser}
                       value={searchText}/>
          } trigger="click">
            <span className="gx-pointer gx-d-block"><i className="icon icon-search-new"/></span>
          </Popover>
        </li>
  
        <li className="gx-language">
          <Popover overlayClassName="gx-popover-horizantal" placement="bottomRight" content={languageMenu()}
                   trigger="click">
                <span className="gx-pointer gx-flex-row gx-align-items-center">
                  <i className={`flag flag-24 flag-${locale.icon}`}/>
                  <span className="gx-pl-2 gx-language-name">{locale.name}</span>
                  <i className="icon icon-chevron-down gx-pl-2"/>
                </span>
          </Popover>
        </li>
        <Auxiliary>
            <li className="gx-user-nav"><UserInfo/></li>
          </Auxiliary>
      
      </ul>
    </Header>
  );
};

export default Topbar;
