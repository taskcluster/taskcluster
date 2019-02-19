import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class Clients extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          isNewClient
          {...props}
          component={views.ViewClient}
        />
        <RouteWithProps
          path={`${path}/:clientId`}
          {...props}
          component={views.ViewClient}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewClients}
          description={`Manage clients on the Auth service. This tool allows you to create, modify,
      and delete clients. You can also reset \`accessToken\` and explore indirect scopes.`}
        />
      </Switch>
    );
  }
}
