import views from './views';

export default path => [
  {
    component: views.ViewRole,
    path: `${path}/create`,
    isNewRole: true,
  },
  {
    component: views.ViewRole,
    path: `${path}/:roleId`,
  },
  {
    component: views.ViewRoles,
    path,
    description:
      'Manage roles on Auth service. This tool allows you to create, modify, and delete roles. You can also manage scopes and explore indirect scopes.',
  },
];
