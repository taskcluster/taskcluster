import lazy from '../../utils/lazy';

const WorkerManagerViewWorkerTypes = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerTypes' */ './WMViewWorkerTypes')
);
const WorkerManagerViewWorkers = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMViewWorkerType' */ './WMViewWorkers')
);
const WMWorkerTypeEditor = lazy(() =>
  import(/* webpackChunkName: 'WorkerManager.WMEditWorkerType' */ './WMEditWorkerType')
);

export default path => [
  {
    component: WMWorkerTypeEditor,
    isNewWorkerType: true,
    path: `${path}/create`,
    description: 'Create a worker type',
  },
  {
    component: WMWorkerTypeEditor,
    path: `${path}/:workerType/edit`,
    description: 'Edit the worker type',
  },
  {
    component: WorkerManagerViewWorkers,
    path: `${path}/worker-types/:workerType`,
    description: 'View workers for that specific worker type',
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
