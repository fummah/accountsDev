import React from "react";

import UserCell from "./UserCell/index";

const UserList = ({userList, addFavourite, onUserSelect, onSaveUser, onDeleteUser}) => {
  return (
    <div className="gx-contact-main-content">
      {userList.map((user, index) =>
        <UserCell key={index} user={user} onDeleteUser={onDeleteUser}
                     onSaveUser={onSaveUser}
                     addFavourite={addFavourite} onUserSelect={onUserSelect}/>
      )}

    </div>
  )
};

export default UserList;
