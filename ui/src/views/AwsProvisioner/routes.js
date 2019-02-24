import views from './views';

export default path => [
  {
    component: views.ViewAwsWorkerTypeDefinition,
    path: `${path}/:workerType/edit`,
  },
  {
    component: views.ViewAwsWorkerTypeDefinition,
    isNewWorkerType: true,
    path: `${path}/create`,
  },
  {
    component: views.ViewAwsHealth,
    path: `${path}/aws-health`,
  },
  {
    component: views.ViewAwsRecentErrors,
    path: `${path}/recent-errors`,
  },
  {
    component: views.ViewAwsWorkerType,
    path: `${path}/:workerType`,
  },
  {
    component: views.ViewAwsWorkerTypes,
    path,
    description:
      'Manage worker types known to the AWS Provisioner and check on the status of AWS nodes.',
  },
];
