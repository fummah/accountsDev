import React from "react";
import {Col, Row} from "antd";
import Overview from "../../../components/detail/Overview/index";
import PolicyholderClaims from "../../../components/detail/PolicyholderClaims/index";
import Contact from "../../../components/detail/Contact/index";

import {documentList,doctorList} from './data'
import Documents from "../../../components/detail/Documents/index";
import Auxiliary from "../../../util/Auxiliary";
import ProfileHeader from "../../../components/detail/ProfileHeader/index";


const Profile = () => {

  return (
    <Auxiliary>
      <ProfileHeader/>
      <div className="gx-profile-content">
        <Row>
          <Col xl={16} lg={14} md={14} sm={24} xs={24}>
            <Overview/>
            <PolicyholderClaims/>
          </Col>

          <Col xl={8} lg={10} md={10} sm={24} xs={24}>
            <Contact/>
            <Row>
              <Col xl={24} lg={24} md={24} sm={12} xs={24}>
                <Documents documentList={documentList}/>
              </Col>
              <Col xl={24} lg={24} md={24} sm={12} xs={24}>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>
    </Auxiliary>
  );
};

export default Profile;


