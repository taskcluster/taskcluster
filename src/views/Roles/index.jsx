import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewRoles = loadable(() =>
  import(/* webpackChunkName: 'Roles.ViewRoles' */ './ViewRoles')
);
const ViewRole = loadable(() =>
  import(/* webpackChunkName: 'Roles.ViewRole' */ './ViewRole')
);

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
          component={ViewRole}
        />
        <RouteWithProps
          path={`${path}/:roleId`}
          {...props}
          component={ViewRole}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ViewRoles}
          description="Manage roles on Auth service. This tool allows you to create, modify,
      and delete roles. You can also manage scopes and explore indirect scopes."
        />
      </Switch>
    );
  }
}
