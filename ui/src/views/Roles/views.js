import lazy from '../../utils/lazy';

export default {
  ViewRoles: lazy(() =>
    import(/* webpackChunkName: 'Roles.ViewRoles' */ './ViewRoles')
  ),
  ViewRole: lazy(() =>
    import(/* webpackChunkName: 'Roles.ViewRole' */ './ViewRole')
  ),
};
