import lazy from '../../../utils/lazy';

const ListNamespaces = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.ListNamespaces' */ './ListNamespaces')
);
const IndexedTask = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.IndexedTask' */ './IndexedTask')
);

export default path => [
  {
    component: IndexedTask,
    path: `${path}/:namespace/:namespaceTaskId`,
  },
  {
    component: ListNamespaces,
    path: `${path}/:namespace?`,
  },
];
