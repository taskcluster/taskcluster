import lazy from '../../utils/lazy';

export default {
  ListScopes: lazy(() =>
    import(/* webpackChunkName: 'Scopes.ListScopes' */ './ListScopes')
  ),
  ViewScope: lazy(() =>
    import(/* webpackChunkName: 'Scopes.ViewScope' */ './ViewScope')
  ),
  ScopesetExpander: lazy(() =>
    import(/* webpackChunkName: 'ScopesetExpander' */ './ScopesetExpander')
  ),
  ScopesetComparison: lazy(() =>
    import(/* webpackChunkName: 'ScopesetComparison' */ './ScopesetComparison')
  ),
};
