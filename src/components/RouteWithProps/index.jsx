import { Component } from 'react';
import { Route } from 'react-router-dom';

/**
 * Conditionally render a component based on location, with non-react-router
 * specific properties forwarded to the rendering component.
 */
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
