import lazy from '../../utils/lazy';

export default {
  ViewAwsWorkerTypes: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerTypes' */ './ViewAwsWorkerTypes')
  ),
  ViewAwsWorkerType: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerType' */ './ViewAwsWorkerType')
  ),
  ViewAwsHealth: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth')
  ),
  ViewAwsRecentErrors: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsRecentErrors' */ './ViewAwsRecentErrors')
  ),
  ViewAwsWorkerTypeDefinition: lazy(() =>
    import(/* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerTypeDefinition' */ './ViewAwsWorkerTypeDefinition')
  ),
};
