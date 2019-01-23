import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';

const ListHooks = lazy(() =>
  import(/* webpackChunkName: 'Hooks.ListHooks' */ './ListHooks')
);
const ViewHook = lazy(() =>
  import(/* webpackChunkName: 'Hooks.ViewHook' */ './ViewHook')
);

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
          component={ViewHook}
        />
        <RouteWithProps
          path={`${path}/:hookGroupId/:hookId`}
          {...props}
          component={ViewHook}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ListHooks}
          description="Manage hooks: tasks that are created in response to events within CI."
        />
      </Switch>
    );
  }
}
