import lazy from '../../utils/lazy';

const ViewProvisioners = lazy(() =>
  import(
    /* webpackChunkName: 'Provisioners.ViewProvisioners' */ './ViewProvisioners'
  )
);
const ViewWorkerTypes = lazy(() =>
  import(
    /* webpackChunkName: 'Provisioners.ViewWorkerTypes' */ './ViewWorkerTypes'
  )
);
const ViewWorker = lazy(() =>
  import(/* webpackChunkName: 'Provisioners.ViewWorker' */ './ViewWorker')
);
const ViewWorkers = lazy(() =>
  import(/* webpackChunkName: 'Provisioners.ViewWorkers' */ './ViewWorkers')
);
const PendingTasks = lazy(() =>
  import(/* webpackChunkName: 'Provisioners.PendingTasks' */ './PendingTasks')
);
const ClaimedTasks = lazy(() =>
  import(/* webpackChunkName: 'Provisioners.ClaimedTasks' */ './ClaimedTasks')
);

export default path => [
  {
    component: PendingTasks,
    path: `${path}/:provisionerId/worker-types/:workerType/pending-tasks`,
  },
  {
    component: ClaimedTasks,
    path: `${path}/:provisionerId/worker-types/:workerType/claimed-tasks`,
  },
  {
    component: ViewWorker,
    path: `${path}/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId`,
  },
  {
    component: ViewWorkers,
    path: `${path}/:provisionerId/worker-types/:workerType`,
  },
  {
    component: ViewWorkerTypes,
    path: `${path}/:provisionerId`,
  },
  {
    component: ViewProvisioners,
    path,
    description:
      'List worker-types for provisioners and see relevant information. List workers for a worker-type and see relevant information. Drill down into a specific worker and perform actions against it or see recent tasks it has claimed.',
  },
];
