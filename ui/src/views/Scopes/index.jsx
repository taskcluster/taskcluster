import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

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
          path={`${path}/expansions`}
          {...props}
          component={views.ScopesetExpander}
        />
        <RouteWithProps
          path={`${path}/compare`}
          {...props}
          component={views.ScopesetComparison}
        />
        <RouteWithProps
          path={`${path}/:selectedScope`}
          {...props}
          component={views.ViewScope}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ListScopes}
          description="Explore scopes on the Auth service. This tool allows you to find roles and
      clients with a given scope. This is effectively reverse client and role lookup."
        />
      </Switch>
    );
  }
}
