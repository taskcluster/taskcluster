import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class Hooks extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          isNewHook
          {...props}
          component={views.ViewHook}
        />
        <RouteWithProps
          path={`${path}/:hookGroupId/:hookId`}
          {...props}
          component={views.ViewHook}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ListHooks}
          description="Manage hooks: tasks that are created in response to events within CI."
        />
      </Switch>
    );
  }
}
