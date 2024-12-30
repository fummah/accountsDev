import React, { useEffect, useState } from 'react';
import {Button, Checkbox, Drawer, message} from 'antd';
import CustomScrollbars from "util/CustomScrollbars";
import AppModuleHeader from "components/AppModuleHeader/index";
import AddUser from "components/lists/UsersList/AddUser";
import IntlMessages from "util/IntlMessages";
import userList from "./data/userList";
import UsersList from "components/lists/UsersList/UserList";

let userId = 723812738;

const filterOptions = [
  {
    id: 1,
    name: 'All Employees',
    icon: 'all-contacts'
  }, {
    id: 2,
    name: 'Active Employees',
    icon: 'star'

  }, {

    id: 3,
    name: 'Inactive Employees',
    icon: 'frequent'
  }
];

const Users = () => {
  const [users, setUsers] = useState([]);
  const [state, setState] = useState({
    noContentFoundMessage: 'No User found in selected folder',
    alertMessage: '',
    showMessage: false,
    selectedSectionId: 1,
    drawerState: false,
    user: {
      name: 'Robert Johnson',
      email: 'robert.johnson@example.com',
      avatar: "https://via.placeholder.com/150",
    },
    searchUser: '',
    filterOption: 'All users',
    allUser: userList, // Assuming `userList` is defined elsewhere in your code
    users: userList,
    selectedUser: null,
    selectedUsers: 0,
    AddUserState: false,
  });
  useEffect(() => {
    // Fetch users when the component loads
    window.electronAPI.getAllEmployees().then(setUsers);
  }, []);

  const UserSideBar = (user) => (
    <div className="gx-module-side">
      <div className="gx-module-side-header">
        <div className="gx-module-logo">
          <i className="icon icon-contacts gx-mr-4" />
          <span>Employees</span>
        </div>
      </div>
      <div className="gx-module-side-content">
        <CustomScrollbars className="gx-module-side-scroll">
          <div className="gx-module-add-task">
            <Button
              className="gx-btn-block ant-btn"
              type="primary"
              aria-label="add"
              onClick={onAddUser}
            >
              <i className="icon icon-add gx-mr-2" />
              <span>New Employees</span>
            </Button>
          </div>
          <div className="gx-module-side-nav">
            <ul className="gx-module-nav">
              {filterOptions.map((option) => (
                <li key={option.id} className="gx-nav-item">
                  <span
                    className={`gx-link ${
                      option.id === state.selectedSectionId ? 'active' : ''
                    }`}
                    onClick={() => onFilterOptionSelect(option)}
                  >
                    <i className={`icon icon-${option.icon}`} />
                    <span>{option.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CustomScrollbars>
      </div>
    </div>
  );

 

  const onUserSelect = (data) => {
    data.selected = !data.selected;
    let selectedUsers = 0;
    const updatedUserList = state.userList.map((user) => {
      if (user.selected) selectedUsers++;
      return user.id === data.id ? data : user;
    });
    setState((prevState) => ({
      ...prevState,
      selectedUsers,
      users: updatedUserList,
    }));
  };

  const onAddUser = () => setState((prevState) => ({ ...prevState, AddUserState: true }));

  const onUserClose = () => setState((prevState) => ({ ...prevState, AddUserState: false }));

  const onFilterOptionSelect = (option) => {
    let filteredUsers;
    switch (option.name) {
      case 'All users':
        filteredUsers = state.allUser;
        break;
      case 'Frequently used':
        filteredUsers = state.allUser.filter((user) => user.frequently);
        break;
      case 'Starred users':
        filteredUsers = state.allUser.filter((user) => user.starred);
        break;
      default:
        break;
    }
    setState((prevState) => ({
      ...prevState,
      selectedSectionId: option.id,
      filterOption: option.name,
      users: filteredUsers,
    }));
  };

  const onSaveUser = (data) => {
    let isNew = true;
    const updatedUserList = state.allUser.map((user) => {
      if (user.id === data.id) {
        isNew = false;
        return data;
      }
      return user;
    });
    if (isNew) updatedUserList.push(data);

    setState((prevState) => ({
      ...prevState,
      alertMessage: isNew ? 'Employee Added Successfully' : 'User Updated Successfully',
      showMessage: true,
      users: updatedUserList,
      allUser: updatedUserList,
    }));
  };

  const onDeleteUser = (data) => {
    setState((prevState) => ({
      ...prevState,
      alertMessage: 'User Deleted Successfully',
      showMessage: true,
      allUser: prevState.allUser.filter((user) => user.id !== data.id),
      users: prevState.allUser.filter((user) => user.id !== data.id),
    }));
  };

  const handleRequestClose = () => setState((prevState) => ({ ...prevState, showMessage: false }));

  const updateUser = (evt) => {
    const searchUser = evt.target.value;
    setState((prevState) => ({
      ...prevState,
      searchUser,
    }));
  };

  return (
    <div className="gx-main-content">
      <div className="gx-app-module">
        <div className="gx-d-block gx-d-lg-none">
          <Drawer
            placement="left"
            closable={false}
            visible={state.drawerState}
            onClose={() => setState((prevState) => ({ ...prevState, drawerState: !prevState.drawerState }))}
          >
            {UserSideBar()}
          </Drawer>
          
        </div>
        <div className="gx-module-sidenav gx-d-none gx-d-lg-flex">{UserSideBar(state.user)}</div>

        <div className="gx-module-box">
          <div className="gx-module-box-header">
            <span className="gx-drawer-btn gx-d-flex gx-d-lg-none">
              <i
                className="icon icon-menu gx-icon-btn"
                aria-label="Menu"
                onClick={() => setState((prevState) => ({ ...prevState, drawerState: !prevState.drawerState }))}
              />
            </span>
            <AppModuleHeader
              placeholder="Search User"
              notification={false}
              apps={false}
              user={state.user}
              onChange={updateUser}
              value={state.searchUser}
            />
          </div>

          <div className="gx-module-box-content">
            <div className="gx-module-box-topbar">
              <Checkbox
                color="primary"
                className="gx-icon-btn"
                indeterminate={state.selectedUsers > 0 && state.selectedUsers < users.length}
                checked={state.selectedUsers > 0}
                onChange={() => setState((prevState) => ({ ...prevState, drawerState: !prevState.drawerState }))}
                value="SelectMail"
              />
              {state.selectedUsers > 0 && (
                <i className="gx-icon-btn icon icon-trash"/>
              )}
            </div>
            <CustomScrollbars className="gx-module-content-scroll">
              {users.length === 0 ? (
                <div className="gx-h-100 gx-d-flex gx-align-items-center gx-justify-content-center">
                  {state.noContentFoundMessage}
                </div>
              ) : (
               
                <UsersList
                  userList={users}
                  onUserSelect={onUserSelect}
                  onDeleteUser={onDeleteUser}
                  onSaveUser={onSaveUser}
                />
                
              )}
            </CustomScrollbars>
          </div>
        </div>
      </div>

      <AddUser
        open={state.AddUserState}
        user={{
          id: userId++,
          first_name: '',
          last_name: '',
          email: '',
          mi: '',
          date_hired: '',
          selected: false,
          starred: false,
          frequently: false,
        }}
        onSaveUser={onSaveUser}
        onUserClose={onUserClose}
        onDeleteUser={onDeleteUser}
      />

      {state.showMessage && message.info(<span id="message-id">{state.alertMessage}</span>, 3, handleRequestClose)}
    </div>
  );
};

export default Users;




