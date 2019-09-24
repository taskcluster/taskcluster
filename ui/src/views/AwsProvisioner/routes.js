import lazy from '../../utils/lazy';

const ViewAwsWorkerTypes = lazy(() =>
  import(
    /* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerTypes' */ './ViewAwsWorkerTypes'
  )
);
const ViewAwsWorkerType = lazy(() =>
  import(
    /* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerType' */ './ViewAwsWorkerType'
  )
);
const ViewAwsHealth = lazy(() =>
  import(
    /* webpackChunkName: 'AwsProvisioner.ViewAwsHealth' */ './ViewAwsHealth'
  )
);
const ViewAwsRecentErrors = lazy(() =>
  import(
    /* webpackChunkName: 'AwsProvisioner.ViewAwsRecentErrors' */ './ViewAwsRecentErrors'
  )
);
const ViewAwsWorkerTypeDefinition = lazy(() =>
  import(
    /* webpackChunkName: 'AwsProvisioner.ViewAwsWorkerTypeDefinition' */ './ViewAwsWorkerTypeDefinition'
  )
);

export default path => [
  {
    component: ViewAwsWorkerTypeDefinition,
    path: `${path}/:workerType/edit`,
  },
  {
    component: ViewAwsWorkerTypeDefinition,
    isNewWorkerType: true,
    path: `${path}/create`,
  },
  {
    component: ViewAwsHealth,
    path: `${path}/aws-health`,
  },
  {
    component: ViewAwsRecentErrors,
    path: `${path}/recent-errors`,
  },
  {
    component: ViewAwsWorkerType,
    path: `${path}/:workerType`,
  },
  {
    component: ViewAwsWorkerTypes,
    path,
    description:
      'Manage worker types known to the AWS Provisioner and check on the status of AWS nodes.',
  },
];
