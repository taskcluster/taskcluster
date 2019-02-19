import lazy from '../../utils/lazy';

export default {
  ViewCachePurges: lazy(() =>
    import(/* webpackChunkName: 'CachePurges.ViewCachePurges' */ './ViewCachePurges')
  ),
  CreatePurgeCacheRequest: lazy(() =>
    import(/* webpackChunkName: 'CachePurges.CreatePurgeCacheRequest' */ './CreatePurgeCacheRequest')
  ),
};
