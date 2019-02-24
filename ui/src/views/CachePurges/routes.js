import views from './views';

export default path => [
  {
    component: views.CreatePurgeCacheRequest,
    path: `${path}/create`,
  },
  {
    component: views.ViewCachePurges,
    path,
    description:
      'View currently active cache purges and schedule a new one if needed.',
  },
];
