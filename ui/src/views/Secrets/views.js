import lazy from '../../utils/lazy';

export default {
  ViewSecrets: lazy(() =>
    import(/* webpackChunkName: 'Secrets.ViewSecrets' */ './ViewSecrets')
  ),
  ViewSecret: lazy(() =>
    import(/* webpackChunkName: 'Secrets.ViewSecrets' */ './ViewSecrets')
  ),
};
