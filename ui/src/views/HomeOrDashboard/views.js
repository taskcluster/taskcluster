import lazy from '../../utils/lazy';

export default {
  Home: lazy(() => import(/* webpackChunkName: 'Home' */ '../Home')),
  Dashboard: lazy(() =>
    import(/* webpackChunkName: 'Dashboard' */ '../Dashboard')
  ),
};
