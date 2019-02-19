import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class Secrets extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;
    const description =
      'Manage secrets: values that can only be retrieved with the appropriate scopes.';

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          isNewSecret
          component={views.ViewSecret}
          description={description}
        />
        <RouteWithProps
          path={`${path}/:secret`}
          {...props}
          component={views.ViewSecret}
          description={description}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewSecrets}
          description={description}
        />
      </Switch>
    );
  }
}
