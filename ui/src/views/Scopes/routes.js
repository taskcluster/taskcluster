import lazy from '../../utils/lazy';

const ListScopes = lazy(() =>
  import(/* webpackChunkName: 'Scopes.ListScopes' */ './ListScopes')
);
const ViewScope = lazy(() =>
  import(/* webpackChunkName: 'Scopes.ViewScope' */ './ViewScope')
);
const ScopesetExpander = lazy(() =>
  import(/* webpackChunkName: 'ScopesetExpander' */ './ScopesetExpander')
);
const ScopesetComparison = lazy(() =>
  import(/* webpackChunkName: 'ScopesetComparison' */ './ScopesetComparison')
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
