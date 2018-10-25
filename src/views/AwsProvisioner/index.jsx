import { hot } from 'react-hot-loader';
import React, { lazy, Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';

const ViewWorkerTypes = lazy(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypes' */ './ViewWorkerTypes')
);
const ViewWorkerType = lazy(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerType' */ './ViewWorkerType')
);
const ViewAwsHealth = lazy(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth')
);
const ViewRecentErrors = lazy(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewRecentErrors' */ './ViewRecentErrors')
);
const ViewWorkerTypeDefinition = lazy(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypeDefinition' */ './ViewWorkerTypeDefinition')
);

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
          component={ViewWorkerTypeDefinition}
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          isNewWorkerType
          component={ViewWorkerTypeDefinition}
        />
        <RouteWithProps
          path={`${path}/aws-health`}
          {...props}
          component={ViewAwsHealth}
        />
        <RouteWithProps
          path={`${path}/recent-errors`}
          {...props}
          component={ViewRecentErrors}
        />
        <RouteWithProps
          path={`${path}/:workerType`}
          {...props}
          component={ViewWorkerType}
        />
        <RouteWithProps
          path={path}
          {...props}
          component={ViewWorkerTypes}
          description="Manage worker types known to the AWS Provisioner and check on the status of AWS nodes."
        />
      </Switch>
    );
  }
}
