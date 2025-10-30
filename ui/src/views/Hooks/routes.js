import lazy from '../../utils/lazy';
import ListHookGroups from './ListHookGroups';

const ListHooks = lazy(() =>
  import('./ListHooks')
);
const ViewHook = lazy(() =>
  import('./ViewHook')
);

export default path => [
  {
    component: ViewHook,
    path: `${path}/create`,
    isNewHook: true,
  },
  {
    component: ViewHook,
    path: `${path}/:hookGroupId/:hookId`,
  },
  {
    component: ListHooks,
    path: `${path}/:hookGroupId`,
    description:
      'Manage hooks: tasks that are created in response to events within CI.',
  },
  {
    component: ListHookGroups,
    path,
    description: 'List hook groups',
  },
];
