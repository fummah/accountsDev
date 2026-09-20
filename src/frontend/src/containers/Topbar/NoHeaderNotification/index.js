import React from "react";
import {useDispatch, useSelector} from "react-redux";
import {toggleCollapsedSideNav} from "../../../appRedux/actions/Setting";
import IntlMessages from "util/IntlMessages";

const NoHeaderNotification = () => {
  const dispatch = useDispatch();
  const navCollapsed = useSelector(({common}) => common.navCollapsed);

  return (
    <div className="gx-no-header-horizontal">
      <div className="gx-d-block gx-d-lg-none gx-linebar gx-mr-xs-3">
        <i className="gx-icon-btn icon icon-menu"
           onClick={() => {
             dispatch(toggleCollapsedSideNav(!navCollapsed));
           }}
        />
      </div>
    </div>
  )
};

export default NoHeaderNotification;
