import lazy from '../../../utils/lazy';

const ListNamespaces = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.ListNamespaces' */ './ListNamespaces')
);
const IndexedTask = lazy(() =>
  import(/* webpackChunkName: 'TaskIndex.IndexedTask' */ './IndexedTask')
);
const taskIndexDescription =
  'The generic index browser lets you browse through the hierarchy of namespaces in the index, and discover indexed tasks.';

export default path => [
  {
    component: IndexedTask,
    description: taskIndexDescription,
    path: `${path}/:namespace/:namespaceTaskId`,
  },
  {
    component: ListNamespaces,
    description: taskIndexDescription,
    path: `${path}/:namespace?`,
  },
];
