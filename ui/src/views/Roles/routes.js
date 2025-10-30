import lazy from '../../utils/lazy';

const ViewRoles = lazy(() =>
  import('./ViewRoles')
);
const ViewRole = lazy(() =>
  import('./ViewRole')
);

export default path => [
  {
    component: ViewRole,
    path: `${path}/create`,
    isNewRole: true,
  },
  {
    component: ViewRole,
    path: `${path}/:roleId`,
  },
  {
    component: ViewRoles,
    path,
    description:
      'Manage roles on Auth service. This tool allows you to create, modify, and delete roles. You can also manage scopes and explore indirect scopes.',
  },
];
