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

export default path => [
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
