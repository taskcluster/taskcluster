import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';

const ListScopes = lazy(() =>
  import(/* webpackChunkName: 'Scopes.ListScopes' */ './ListScopes')
);
const ViewScope = lazy(() =>
  import(/* webpackChunkName: 'Scopes.ViewScope' */ './ViewScope')
);

@hot(module)
export default class Scopes extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:selectedScope`}
          {...props}
          component={ViewScope}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ListScopes}
          description="Explore scopes on the Auth service. This tool allows you to find roles and
      clients with a given scope. This is effectively reverse client and role lookup."
        />
      </Switch>
    );
  }
}
