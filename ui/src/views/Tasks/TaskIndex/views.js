import lazy from '../../../utils/lazy';

export default {
  ListNamespaces: lazy(() =>
    import(/* webpackChunkName: 'TaskIndex.ListNamespaces' */ './ListNamespaces')
  ),
  IndexedTask: lazy(() =>
    import(/* webpackChunkName: 'TaskIndex.IndexedTask' */ './IndexedTask')
  ),
};
