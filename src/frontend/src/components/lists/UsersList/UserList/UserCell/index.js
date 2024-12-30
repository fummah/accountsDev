import React from "react";
import {Avatar, Checkbox, Dropdown, Menu} from "antd";

import AddUser from "../../AddUser/index";

const options = [
  'Edit',
  'Delete',
];

class UserCell extends React.Component {

  onUserClose = () => {
    this.setState({addUserState: false});
  };
  onDeleteUser = (user) => {
    this.setState({addUserState: false});
    this.props.onDeleteUser(user);
  };
  onEditUser = () => {
    this.setState({addUserState: true});
  };
  menus = () => (<Menu onClick={(e) => {
    if (e.key === 'Edit') {
      this.onEditUser()
    } else {
      this.onDeleteUser(this.props.user)
    }
  }
  }>
    {options.map(option =>
      <Menu.Item key={option}>
        {option}
      </Menu.Item>,
    )}
  </Menu>);

  constructor() {
    super();
    this.state = {
      addUserState: false,
    }
  }

  render() {
    const {user, onUserSelect, onSaveUser} = this.props;
    const {addUserState} = this.state;
    const {first_name, last_name, mi,email,date_hired} = user;

    return (

      <div className="gx-contact-item">
        <div className="gx-module-list-icon">
          <Checkbox className="gx-icon-btn"
                    checked={user.selected}
                    value="checkedF"
                    onClick={() => {
                      onUserSelect(user)
                    }}/>
          
          
        </div>

        <div className="gx-module-list-info gx-contact-list-info">
          <div className="gx-module-contact-content">
            <p className="gx-mb-1">
              <span className="gx-text-truncate gx-contact-name"> {first_name} {last_name}</span>
              <span className="gx-toolbar-separator">&nbsp;</span>
              <span className="gx-text-truncate gx-job-title">{mi}</span>
            </p>

            <div className="gx-text-muted">
            <span className="gx-email gx-d-inline-block gx-mr-2">
                {email},
            </span>
              <span className="gx-phone gx-d-inline-block">{date_hired}</span>
            </div>
          </div>

          <div className="gx-module-contact-right">

            <Dropdown overlay={this.menus()} placement="bottomRight" trigger={['click']}>
              <i className="gx-icon-btn icon icon-ellipse-v"/>
            </Dropdown>

            {addUserState &&
            <AddUser open={addUserState} user={user} onSaveUser={onSaveUser}
                        onUserClose={this.onUserClose} onDeleteUser={this.onDeleteUser}/>}
          </div>
        </div>
      </div>
    )
  }
}

export default UserCell;
