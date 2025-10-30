import lazy from '../../utils/lazy';

const ViewCachePurges = lazy(() =>
  import(
    './ViewCachePurges'
  )
);
const CreatePurgeCacheRequest = lazy(() =>
  import(
    './CreatePurgeCacheRequest'
  )
);

export default path => [
  {
    component: CreatePurgeCacheRequest,
    path: `${path}/create`,
  },
  {
    component: ViewCachePurges,
    path,
    description:
      'View currently active cache purges and schedule a new one if needed.',
  },
];
