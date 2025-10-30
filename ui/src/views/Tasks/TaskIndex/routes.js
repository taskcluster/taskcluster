import lazy from '../../../utils/lazy';

const ListNamespaces = lazy(() => import('./ListNamespaces'));
const IndexedTask = lazy(() => import('./IndexedTask'));
const IndexedTaskTaskGroupRedirect = lazy(() =>
  import('./IndexedTask/taskGroupRedirect')
);
const taskIndexDescription =
  'The generic index browser lets you browse through the hierarchy of namespaces in the index, and discover indexed tasks.';

export default path => [
  {
    component: IndexedTaskTaskGroupRedirect,
    description: taskIndexDescription,
    path: `${path}/:namespace/:namespaceTaskId/task-group`,
  },
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
