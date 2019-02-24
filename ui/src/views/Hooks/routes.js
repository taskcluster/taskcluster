import views from './views';

export default path => [
  {
    component: views.ViewHook,
    path: `${path}/create`,
    isNewHook: true,
  },
  {
    component: views.ViewHook,
    path: `${path}/:hookGroupId/:hookId`,
  },
  {
    component: views.ListHooks,
    path,
    description:
      'Manage hooks: tasks that are created in response to events within CI.',
  },
];
