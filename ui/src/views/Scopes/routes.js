import views from './views';

const description =
  'Manage secrets: values that can only be retrieved with the appropriate scopes.';

export default path => [
  {
    component: views.ScopesetExpander,
    path: `${path}/expansions`,
  },
  {
    component: views.ScopesetComparison,
    path: `${path}/compare`,
    description,
  },
  {
    component: views.ViewScope,
    path: `${path}/:selectedScope`,
  },
  {
    component: views.ListScopes,
    path,
    description:
      'Explore scopes on the Auth service. This tool allows you to find roles and\n' +
      'clients with a given scope. This is effectively reverse client and role lookup.',
  },
];
