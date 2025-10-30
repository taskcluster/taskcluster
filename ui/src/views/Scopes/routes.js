import lazy from '../../utils/lazy';

const ListScopes = lazy(() =>
  import('./ListScopes')
);
const ViewScope = lazy(() =>
  import('./ViewScope')
);
const ScopesetExpander = lazy(() =>
  import('./ScopesetExpander')
);
const ScopesetComparison = lazy(() =>
  import('./ScopesetComparison')
);
const description =
  'Manage secrets: values that can only be retrieved with the appropriate scopes.';

export default path => [
  {
    component: ScopesetExpander,
    path: `${path}/expansions`,
  },
  {
    component: ScopesetComparison,
    path: `${path}/compare`,
    description,
  },
  {
    component: ViewScope,
    path: `${path}/:selectedScope`,
    description:
      'Explore scopes on the Auth service. This tool allows you to find roles and\n' +
      'clients with a given scope. This is effectively reverse client and role lookup.',
  },
  {
    component: ListScopes,
    path,
    description:
      'Explore scopes on the Auth service. This tool allows you to find roles and\n' +
      'clients with a given scope. This is effectively reverse client and role lookup.',
  },
];
