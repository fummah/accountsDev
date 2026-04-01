import React, {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import {Avatar, Popover} from "antd";
import {userSignOut} from "appRedux/actions/Auth";

const UserProfile = () => {
  const dispatch = useDispatch();
  const [companyLogo, setCompanyLogo] = useState(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const info = await window.electronAPI?.getCompany?.();
        if (info?.logo) setCompanyLogo(info.logo);
        if (info?.name) setCompanyName(info.name);
      } catch {}
    })();
  }, []);

  const userMenuOptions = (
    <ul className="gx-user-popover">
      <li>My Users</li>
      <li onClick={() => dispatch(userSignOut())}>Logout
      </li>
    </ul>
  );

  return (

    <div className="gx-flex-row gx-align-items-center gx-mb-4 gx-avatar-row">
      <Popover placement="bottomRight" content={userMenuOptions} trigger="click">
        <Avatar src={companyLogo || "https://via.placeholder.com/150"}
                className="gx-size-40 gx-pointer gx-mr-3" alt=""/>
        <span className="gx-avatar-name">{companyName || 'My Company'}<i
          className="icon icon-chevron-down gx-fs-xxs gx-ml-2"/></span>
      </Popover>
    </div>

  )
};

export default UserProfile;
