import { Component } from 'react';
import { Route } from 'react-router-dom';

export default class RouteWithProps extends Component {
  render() {
    const {
      component: Component,
      path,
      exact,
      strict,
      location,
      sensitive,
      ...props
    } = this.props;

    return (
      <Route
        path={path}
        exact={exact}
        strict={strict}
        location={location}
        sensitive={sensitive}
        render={renderProps => <Component {...renderProps} {...props} />}
      />
    );
  }
}
