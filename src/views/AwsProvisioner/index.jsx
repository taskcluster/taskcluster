import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewWorkerTypes = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypes' */ './ViewWorkerTypes')
);
const ViewWorkerType = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerType' */ './ViewWorkerType')
);
const ViewAwsHealth = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth')
);
const ViewRecentErrors = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewRecentErrors' */ './ViewRecentErrors')
);
const ViewWorkerTypeDefinition = loadable(() =>
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
        <RouteWithProps path={path} {...props} component={ViewWorkerTypes} />
      </Switch>
    );
  }
}
