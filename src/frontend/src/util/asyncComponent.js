import React, {Component} from "react";
import Nprogress from "nprogress";
import ReactPlaceholder from "react-placeholder";
import "nprogress/nprogress.css";

import "react-placeholder/lib/reactPlaceholder.css";
import CircularProgress from "components/CircularProgress";

export default function asyncComponent(importComponent) {
  class AsyncFunc extends Component {
    constructor(props) {
      super(props);
      this.state = {
        component: null
      };
    }

    componentDidMount() {
      this.mounted = true;
      Nprogress.start();
      this.loadComponent();
    }

    componentWillUnmount() {
      this.mounted = false;
    }

    async loadComponent() {
      try {
        const {default: Component} = await importComponent();
        Nprogress.done();
        if (this.mounted) {
          this.setState({
            component: <Component {...this.props} />
          });
        }
      } catch (error) {
        console.error('Error loading component:', error);
        Nprogress.done();
        if (this.mounted) {
          this.setState({
            component: <div>Error loading component</div>
          });
        }
      }
    }

    render() {
      const Component = this.state.component || <CircularProgress/>;
      return (
        <ReactPlaceholder type="text" rows={7} ready={Component !== null}>
          {Component}
        </ReactPlaceholder>
      );
    }
  }

  return AsyncFunc;
}
