import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class Provisioners extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId`}
          {...props}
          component={views.ViewWorker}
        />
        <RouteWithProps
          path={`${path}/:provisionerId/worker-types/:workerType`}
          {...props}
          component={views.ViewWorkers}
        />
        <RouteWithProps
          path={`${path}/:provisionerId`}
          {...props}
          component={views.ViewWorkerTypes}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewProvisioners}
          description="List worker-types for provisioners and see relevant information.
      List workers for a worker-type and see relevant information. Drill down into a
      specific worker and perform actions against it or see recent tasks it has claimed."
        />
      </Switch>
    );
  }
}
