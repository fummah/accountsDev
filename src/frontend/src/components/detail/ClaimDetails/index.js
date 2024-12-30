import React from "react";
import {Tabs} from "antd";
import Widget from "components/Widget";
import ClaimTab1 from "./ClaimTab1";
import ClaimTab2 from "./ClaimTab2";
import ClaimTab3 from "./ClaimTab3";


const TabPane = Tabs.TabPane;

const ClaimDetails = () => {

    return (
      <Widget title="Claim Summary" styleName="gx-card-tabs gx-card-profile">
        <Tabs className='gx-tabs-right' defaultActiveKey="1">
          <TabPane tab="Claim Info" key="1">
            <div className="gx-mb-2">
             <ClaimTab1/>
            </div>
          </TabPane>
          <TabPane tab="Dates" key="2">
            <div className="gx-mb-2">
            <ClaimTab2/>
            </div>
          </TabPane>
          <TabPane tab="Extras" key="3">
            <div className="gx-mb-2">
            <ClaimTab3/>
            </div>
          </TabPane>
        </Tabs>
      </Widget>
    );
}


export default ClaimDetails;
