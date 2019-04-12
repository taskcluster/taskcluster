import lazy from '../../utils/lazy';

const WMViewWorkerTypes = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerTypes' */ './WMViewWorkerTypes')
);
const WMViewWorkers = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerType' */ './WMViewWorkers')
);

export default path => [
  {
    component: WMViewWorkers,
    path: `${path}/worker-types/:workerType`,
    description: 'View workers for that specific worker type',
  },
  {
    component: WMViewWorkers,
    path: `${path}/providers/:provider`,
    description: 'View workers for that specific provider',
  },
  {
    component: WMViewWorkerTypes,
    path,
    description:
      'Manage worker types known to the Worker Manager and check on the status of the nodes.',
  },
];
