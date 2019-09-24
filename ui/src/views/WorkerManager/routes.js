import lazy from '../../utils/lazy';

const WorkerManagerViewWorkerPools = lazy(() =>
  import(
    /* webpackChunkName: 'WorkerManager.WMViewWorkerPools' */ './WMViewWorkerPools'
  )
);
const WorkerManagerViewWorkers = lazy(() =>
  import(
    /* webpackChunkName: 'WorkerManager.WMViewWorkers' */ './WMViewWorkers'
  )
);
const WMWorkerPoolEditor = lazy(() =>
  import(
    /* webpackChunkName: 'WorkerManager.WMEditWorkerPool' */ './WMEditWorkerPool'
  )
);

export default path => [
  {
    component: WMWorkerPoolEditor,
    isNewWorkerPool: true,
    path: `${path}/create`,
    description: 'Create a worker pool',
  },
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/:workerPoolId/workers`,
    description: 'View workers for that specific worker pool',
  },
  {
    component: WMWorkerPoolEditor,
    path: `${path}/:workerPoolId`,
    description: 'A view to inspect/edit a worker pool',
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
