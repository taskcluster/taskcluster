import lazy from '../../utils/lazy';

const WorkerManagerViewWorkerPools = lazy(() => import('./WMViewWorkerPools'));
const WorkerManagerViewWorkers = lazy(() => import('./WMViewWorkers'));
const WorkerManagerViewErrors = lazy(() => import('./WMViewErrors'));
const WorkerManagerViewErrorCenter = lazy(() => import('./WMViewErrorCenter'));
const WMWorkerPoolEditor = lazy(() => import('./WMEditWorkerPool'));
const WMWorkerPoolLaunchConfigs = lazy(() => import('./WMLaunchConfigs'));

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
    component: WMWorkerPoolLaunchConfigs,
    path: `${path}/:workerPoolId/launch-configs`,
    description: 'View launch configs for that specific worker pool',
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
