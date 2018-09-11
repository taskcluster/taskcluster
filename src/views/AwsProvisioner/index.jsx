import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Switch } from 'react-router-dom';
import RouteWithProps from '../../components/RouteWithProps';
import loadable from '../../utils/loadable';

const ViewWorkerTypes = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypes' */ './ViewWorkerTypes')
);
const ViewAwsHealth = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth')
);
const ViewRecentErrors = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewRecentErrors' */ './ViewRecentErrors')
);
const ViewWorkerType = loadable(() =>
  import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerType' */ './ViewWorkerType')
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
          component={ViewWorkerType}
        />
        <RouteWithProps
          path={`${path}/create`}
          {...props}
          isNewWorkerType
          component={ViewWorkerType}
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
        <RouteWithProps path={path} {...props} component={ViewWorkerTypes} />
      </Switch>
    );
  }
}
