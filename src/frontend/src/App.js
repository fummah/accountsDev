import React from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import SignIn from './containers/SignIn';
import SignUp from './containers/SignUp';
import MainApp from './routes/main';
import { ConfigProvider } from 'antd';

const App = () => {
  return (
    <ConfigProvider>
      <Router>
        <Switch>
          <Route path="/signin" component={SignIn} />
          <Route path="/signup" component={SignUp} />
          <Route path="/main" component={MainApp} />
          <Route exact path="/" render={() => <Redirect to="/main/dashboard" />} />
        </Switch>
      </Router>
    </ConfigProvider>
  );
};

export default App;