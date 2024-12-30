import React from "react";
import {Avatar} from "antd";
import AddClaim from "components/Drawers/AddClaim";
import AddPolicyholder from "components/Drawers/AddPolicyholder";
import AddDocument from "components/Drawers/AddDocument";
import AddNote from "components/Drawers/AddNote";

const ProfileHeader = () => {
  return (
    <div className="gx-profile-banner">
      <div className="gx-profile-container">
        <div className="gx-profile-banner-top">
          <div className="gx-profile-banner-top-left">
            <div className="gx-profile-banner-avatar">
              <Avatar className="gx-size-90" alt="..." src={"/assets/images/150.png"}/>
            </div>
            <div className="gx-profile-banner-avatar-info">
              <h2 className="gx-mb-2 gx-mb-sm-3 gx-fs-xxl gx-font-weight-light">Kiley Brown</h2>
              <p className="gx-mb-0 gx-fs-lg">Cape Town, South Africa</p>
            </div>
          </div>
          <div className="gx-profile-banner-top-right">
            <ul className="gx-follower-list">
              <li>
                <span className="gx-follower-title gx-fs-lg gx-font-weight-medium">3</span>
                <span className="gx-fs-sm">Claims</span></li>
              <li>
                <span className="gx-follower-title gx-fs-lg gx-font-weight-medium">6</span>
                <span className="gx-fs-sm">Doctors</span></li>
              <li>
                <span className="gx-follower-title gx-fs-lg gx-font-weight-medium">5</span>
                <span className="gx-fs-sm">Documents</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="gx-profile-banner-bottom">
          <div className="gx-tab-list">
            <ul className="gx-navbar-nav">
              <li>
              <AddClaim title="Add New Claim" icon="add-circle" txt="default"/>
              </li>
              <li>
              <AddNote title="Add New Note" icon="add-circle" txt="default"/>
                            </li>
              <li>
              <AddDocument title="Add New File" icon="add-circle" txt="default"/>
              </li>
            
            </ul>
          </div>
          <span className="gx-link gx-profile-setting">
            <AddPolicyholder title="Edit Policyholder" icon="edit" txt="default"/>
          </span>
        </div>
      </div>
    </div>
  )
};

export default ProfileHeader;
