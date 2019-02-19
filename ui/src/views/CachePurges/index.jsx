import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

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
          component={views.CreatePurgeCacheRequest}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewCachePurges}
          description="View currently active cache purges and schedule a new one if needed."
        />
      </Switch>
    );
  }
}
