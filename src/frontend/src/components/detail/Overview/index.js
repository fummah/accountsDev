import React from "react";
import {Col, Row, Tabs} from "antd";
import Widget from "components/Widget";
import {aboutList,banking,policystatus} from '../../../routes/detail/Policyholder/data'
import DetailItem from "./DetailItem";


const TabPane = Tabs.TabPane;

const Overview = () => {

    return (
      <Widget title="Policyholder Details" styleName="gx-card-tabs gx-card-profile">
        <Tabs className='gx-tabs-right' defaultActiveKey="1">
          <TabPane tab="Overview" key="1">
            <div className="gx-mb-2">
              <Row>
                {aboutList.map((about, index) =>
                  <Col key={index} xl={8} lg={12} md={12} sm={12} xs={24}>
                    <DetailItem data={about}/>
                  </Col>
                )}
              </Row>
            </div>
          </TabPane>
          <TabPane tab="Banking" key="2">
            <div className="gx-mb-2">
              <Row>{banking.map((about, index) =>
                <Col key={index} xl={8} lg={12} md={12} sm={12} xs={24}>
                  <DetailItem data={about}/>
                </Col>
              )}
              </Row>
            </div>
          </TabPane>
          <TabPane tab="Policy Info" key="3">
            <div className="gx-mb-2">
              <Row>
                {policystatus.map((about, index) =>

                  <Col key={index} xl={8} lg={12} md={12} sm={12} xs={24}>
                    <DetailItem data={about}/>
                  </Col>
                )}
              </Row>
            </div>
          </TabPane>
        </Tabs>
      </Widget>
    );
}


export default Overview;
