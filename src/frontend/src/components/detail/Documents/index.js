import React from "react";
import Widget from "../../Widget/index";
import AddDocument from "components/Drawers/AddDocument";

const Documents = ({documentList}) => {
  console.log(documentList);
  return (
    <Widget styleName="gx-card-profile-sm"
            title={<span>Documents</span>}>
      <div className="gx-pt-2">
        
        <ul className="gx-mb-0">
          {documentList.map((user, index) =>
            <li className="gx-mb-2" key={index}>
              <h6>{user.name}</h6>
            </li>
          )
          }
        </ul>
        
      </div>
      <AddDocument title="Add New Files" icon="add-circle" txt="primary"/>
    </Widget>
  )
};
export default Documents;
