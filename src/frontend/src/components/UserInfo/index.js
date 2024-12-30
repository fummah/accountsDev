import React from "react";
import {useDispatch} from "react-redux";
import {Avatar, Popover} from "antd";
import {userSignOut} from "appRedux/actions/Auth";

const UserInfo = () => {

  const dispatch = useDispatch();
  const avatarStyle = {
    width: '32px',
    height: '32px',
    backgroundColor: '#003366',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
  };

  const userMenuOptions = (
    <ul className="gx-user-popover">
      <li><h3>Demo</h3><p>demo@example.com</p></li>
      <li onClick={() => dispatch(userSignOut())}>Logout
      </li>
    </ul>
  );

  return (
    <Popover overlayClassName="gx-popover-horizantal" placement="bottomRight" overlayStyle={{ width: '20%'}} content={userMenuOptions}
             trigger="click">
      <div style={avatarStyle}>D</div>
    </Popover>
  )

}

export default UserInfo;

