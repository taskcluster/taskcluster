import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class Roles extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          isNewRole
          {...props}
          component={views.ViewRole}
        />
        <RouteWithProps
          path={`${path}/:roleId`}
          {...props}
          component={views.ViewRole}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewRoles}
          description="Manage roles on Auth service. This tool allows you to create, modify,
      and delete roles. You can also manage scopes and explore indirect scopes."
        />
      </Switch>
    );
  }
}
