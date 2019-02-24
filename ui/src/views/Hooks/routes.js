import lazy from '../../utils/lazy';

const ListHooks = lazy(() =>
  import(/* webpackChunkName: 'Hooks.ListHooks' */ './ListHooks')
);
const ViewHook = lazy(() =>
  import(/* webpackChunkName: 'Hooks.ViewHook' */ './ViewHook')
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
    path,
    description:
      'Manage hooks: tasks that are created in response to events within CI.',
  },
];
