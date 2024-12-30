import React from "react";
import Widget from "components/Widget";
import { Typography } from "antd";

const {  Text } = Typography;

const Messages = ({message,statement_message}) => {
  

    return (
      <Widget title={
        <h3 className="gx-ml-3">Messages</h3>
      } styleName="gx-card-tabs gx-card-profile">
        <br/>
        <Text>
          {message}
        </Text><hr/>
        <Text>
          {statement_message}
        </Text>
      </Widget>
    );
}

export default Messages;
