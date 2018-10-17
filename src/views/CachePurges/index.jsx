import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewCachePurges = loadable(() =>
  import(/* webpackChunkName: 'CachePurges.ViewCachePurges' */ './ViewCachePurges')
);
const CreatePurgeCacheRequest = loadable(() =>
  import(/* webpackChunkName: 'CachePurges.CreatePurgeCacheRequest' */ './CreatePurgeCacheRequest')
);

@hot(module)
export default class CachePurges extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          component={CreatePurgeCacheRequest}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ViewCachePurges}
          description="View currently active cache purges and schedule a new one if needed."
        />
      </Switch>
    );
  }
}
