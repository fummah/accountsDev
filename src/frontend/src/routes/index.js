import React from "react";
import { Route, Switch } from "react-router-dom";

import Main from "./main/index";
import Detail from "./detail/index";
import Lists from "./lists/index";
import Inner from "./inner/index";

const App = ({ match }) => (
  <div className="gx-main-content-wrapper">
    <Switch>
      <Route path={`/main`} component={Main} />     
      <Route path={`/detail`} component={Detail} />
      <Route path={`/lists`} component={Lists} />
      <Route path={`/inner`} component={Inner} />
    </Switch>
  </div>
);

export default App;
