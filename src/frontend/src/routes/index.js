import React from "react";
import { Route, Routes, Switch } from "react-router-dom";

import Main from "./main/index";
import Detail from "./detail/index";
import Lists from "./lists/index";
import Inner from "./inner/index";

const App = ({ match }) => (
  <div className="gx-main-content-wrapper">
    <Switch>
      <Route path={`${match.url}/main`} component={Main} />     
      <Route path={`${match.url}/detail`} component={Detail} />
      <Route path={`${match.url}/lists`} component={Lists} />
      <Route path={`${match.url}/inner`} component={Inner} />
    </Switch>
  </div>
);

export default App;
