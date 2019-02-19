import lazy from '../../utils/lazy';

export default {
  ListHooks: lazy(() =>
    import(/* webpackChunkName: 'Hooks.ListHooks' */ './ListHooks')
  ),
  ViewHook: lazy(() =>
    import(/* webpackChunkName: 'Hooks.ViewHook' */ './ViewHook')
  ),
};
