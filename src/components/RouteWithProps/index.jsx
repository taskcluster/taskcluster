import React, { Suspense, Component } from 'react';
import { Route } from 'react-router-dom';
import withPageTracker from '../../utils/withPageTracker';
import Loading from '../../utils/Loading';

/**
 * Conditionally render a component based on location, with non-react-router
 * specific properties forwarded to the rendering component.
 */
@withPageTracker
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
        render={({ staticContext, ...renderProps }) => (
          <Suspense fallback={<Loading />}>
            <Component {...renderProps} {...props} />
          </Suspense>
        )}
      />
    );
  }
}
