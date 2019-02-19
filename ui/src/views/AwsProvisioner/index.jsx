import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import views from './views';

@hot(module)
export default class AwsProvisioner extends Component {
  render() {
    const {
      match: { path },
      ...props
    } = this.props;

    return (
      <Switch>
        <RouteWithProps
          path={`${path}/:workerType/edit`}
          {...props}
          component={views.ViewWorkerTypeDefinition}
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          isNewWorkerType
          component={views.ViewWorkerTypeDefinition}
        />
        <RouteWithProps
          path={`${path}/aws-health`}
          {...props}
          component={views.ViewAwsHealth}
        />
        <RouteWithProps
          path={`${path}/recent-errors`}
          {...props}
          component={views.ViewRecentErrors}
        />
        <RouteWithProps
          path={`${path}/:workerType`}
          {...props}
          component={views.ViewWorkerType}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={views.ViewWorkerTypes}
          description="Manage worker types known to the AWS Provisioner and check on the status of AWS nodes."
        />
      </Switch>
    );
  }
}
