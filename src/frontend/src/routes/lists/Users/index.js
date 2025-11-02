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
    // start with sample list but will be replaced with backend data on load
    allUser: userList,
    users: userList,
    selectedUser: null,
    selectedUsers: 0,
    AddUserState: false,
  });
  useEffect(() => {
    // Fetch users when the component loads and populate both the local users
    // state (used elsewhere) and the state.allUser used by the sidebar filters.
    const load = async () => {
      try {
        const all = await window.electronAPI.getAllEmployees();
        if (Array.isArray(all)) {
          setUsers(all);
          setState(prev => ({ ...prev, allUser: all, users: all }));
        }
      } catch (err) {
        // keep sample data if backend call fails
        console.error('Failed to load users', err);
      }
    };
    load();
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
    const updatedUserList = (state.users || []).map((user) => {
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

  const onSaveUser = async (data) => {
    // Persist to backend: either insert or update an employee record
    try {
      const first_name = data.first_name || '';
      const last_name = data.last_name || '';
      const mi = data.mi || '';
      const email = data.email || '';
      const phone = data.phone || '';
      const address = data.address || '';
      const entered_by = "1";
      const status = data.status || 'Active';
      const salary = data.salary || 0;
      const date_hired = data.date_hired || null;

      let result;
      // Determine if this matches an existing backend user by id
      const exists = users && users.find(u => u.id === data.id);
      if (exists) {
        const employeeData = { id: data.id, first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status };
        result = await window.electronAPI.updateEmployee(employeeData);
      } else {
        result = await window.electronAPI.insertEmployee(first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status);
      }

      if (result && result.success) {
        // refresh list
        const all = await window.electronAPI.getAllEmployees();
        setUsers(all);
        setState(prev => ({ ...prev, allUser: all, users: all, alertMessage: exists ? 'User Updated Successfully' : 'Employee Added Successfully', showMessage: true }));
      } else {
        setState(prev => ({ ...prev, alertMessage: 'Failed to save user', showMessage: true }));
      }
    } catch (err) {
      console.error('Failed saving user', err);
      setState(prev => ({ ...prev, alertMessage: 'An error occurred saving user', showMessage: true }));
    }
  };

  const onDeleteUser = async (data) => {
    try {
      const result = await window.electronAPI.deleteRecord(data.id, 'employees');
      if (result && result.success) {
        const all = await window.electronAPI.getAllEmployees();
        setUsers(all);
        setState(prev => ({ ...prev, allUser: all, users: all, alertMessage: 'User Deleted Successfully', showMessage: true }));
      } else {
        setState(prev => ({ ...prev, alertMessage: 'Failed to delete user', showMessage: true }));
      }
    } catch (err) {
      console.error('Failed to delete user', err);
      setState(prev => ({ ...prev, alertMessage: 'An error occurred deleting user', showMessage: true }));
    }
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




