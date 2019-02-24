import views from './views';

export default path => [
  {
    component: views.ViewWorker,
    path: `${path}/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId`,
  },
  {
    component: views.ViewWorkers,
    path: `${path}/:provisionerId/worker-types/:workerType`,
  },
  {
    component: views.ViewWorkerTypes,
    path: `${path}/:provisionerId`,
  },
  {
    component: views.ViewProvisioners,
    path,
    description:
      'List worker-types for provisioners and see relevant information. List workers for a worker-type and see relevant information. Drill down into a specific worker and perform actions against it or see recent tasks it has claimed.',
  },
];
