import React from "react";

import Widget from "components/Widget/index";
import ClaimItem from "./ClaimItem";
import {claimList} from "../../../routes/detail/Policyholder/data"

const PolicyholderClaims = () => {
  return (
    <Widget styleName="gx-card-profile">
      <div className="ant-card-head">
        <span className="ant-card-head-title gx-mb-1">Associated Claims</span>
        <p className="gx-text-grey gx-fs-sm gx-mb-0">These are claims associated to this Policyholder</p>
      </div>
      <div className="gx-pt-md-3">
        {claimList.map((data, index) =>
          <ClaimItem key={index} data={data}/>
        )}
      </div>
      
    </Widget>
  );
}

export default PolicyholderClaims;
