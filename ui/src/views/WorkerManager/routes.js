import lazy from '../../utils/lazy';

const WorkerManagerViewWorkerPools = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerPools' */ './WMViewWorkerPools')
);
const WorkerManagerViewWorkers = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkers' */ './WMViewWorkers')
);

export default path => [
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/worker-pools/:workerPool`,
    description: 'View workers for that specific worker pool',
  },
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/providers/:provider`,
    description: 'View workers for that specific provider',
  },
  {
    component: WorkerManagerViewWorkerPools,
    path,
    description:
      'Manage worker pools known to the Worker Manager and check on the status of the nodes.',
  },
];
