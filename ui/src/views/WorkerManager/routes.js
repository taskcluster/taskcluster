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
const WorkerManagerViewErrors = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewErrors' */ './WMViewErrors')
);
const WorkerManagerViewErrorCenter = lazy(() =>
  import(
    /* webpackChunkName: 'WorkerManager.WMViewErrorCenter' */ './WMViewErrorCenter'
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
    component: WorkerManagerViewErrorCenter,
    path: `${path}/errors`,
    description: 'Worker manager errors center',
  },
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/:workerPoolId/workers`,
    description: 'View workers for that specific worker pool',
  },
  {
    component: WorkerManagerViewErrors,
    path: `${path}/:workerPoolId/errors`,
    description: 'View errors for that specific worker pool',
  },
  {
    component: WMWorkerPoolEditor,
    path: `${path}/:workerPoolId`,
    description: 'A view to inspect/edit a worker pool',
  },
  {
    component: WorkerManagerViewWorkerPools,
    path,
    description:
      'Manage worker pools known to the Worker Manager and check on the status of the nodes.',
  },
];
