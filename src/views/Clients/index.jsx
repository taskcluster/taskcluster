import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewClients = loadable(() =>
  import(/* webpackChunkName: 'Clients.ViewClients' */ './ViewClients')
);
const ViewClient = loadable(() =>
  import(/* webpackChunkName: 'Clients.ViewClient' */ './ViewClient')
);

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
          component={ViewClient}
        />
        <RouteWithProps
          path={`${path}/:clientId`}
          {...props}
          component={ViewClient}
        />
        <RouteWithProps path={path} {...props} component={ViewClients} />
      </Switch>
    );
  }
}
