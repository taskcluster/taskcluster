import lazy from '../../utils/lazy';

export default {
  ViewWorkerTypes: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypes' */ './ViewWorkerTypes')
  ),
  ViewWorkerType: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerType' */ './ViewWorkerType')
  ),
  ViewAwsHealth: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth')
  ),
  ViewRecentErrors: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewRecentErrors' */ './ViewRecentErrors')
  ),
  ViewWorkerTypeDefinition: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewWorkerTypeDefinition' */ './ViewWorkerTypeDefinition')
  ),
};
