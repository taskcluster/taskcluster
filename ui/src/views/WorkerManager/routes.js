import lazy from '../../utils/lazy';

const WorkerManagerViewWorkerTypes = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerTypes' */ './WMViewWorkerTypes')
);
const WorkerManagerViewWorkers = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerType' */ './WMViewWorkers')
);
const WMWorkerPoolEditor = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMEditWorkerPool' */ './WMEditWorkerPool')
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
    path: `${path}/worker-types/:workerType`,
    description: 'View workers for that specific worker type',
  },
  {
    component: WMWorkerPoolEditor,
    path: `${path}/:workerPool/edit`,
    description: 'Edit the worker pool',
  },
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/providers/:provider`,
    description: 'View workers for that specific provider',
  },
  {
    component: WorkerManagerViewWorkerTypes,
    path,
    description:
      'Manage worker types known to the Worker Manager and check on the status of the nodes.',
  },
];
