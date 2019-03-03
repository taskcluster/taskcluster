import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';

const ViewDenylist = lazy(() =>
  import(/* webpackChunkName: 'Denylist.ViewDenylist' */ './ViewDenylist')
);
const ViewDenylistAddress = lazy(() =>
  import(/* webpackChunkName: 'Denylist.ViewDenylistAddress' */ './ViewDenylistAddress')
);

@hot(module)
export default class Denylist extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/add`}
          isNewAddress
          {...props}
          component={ViewDenylistAddress}
        />
        <RouteWithProps
          path={`${path}/:notificationAddress`}
          {...props}
          component={ViewDenylistAddress}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ViewDenylist}
          description="Manage the notifications denylist. This page allows you
          to view, modify or delete the denylisted addresses."
        />
      </Switch>
    );
  }
}
