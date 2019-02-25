import lazy from '../../utils/lazy';

const ViewSecrets = lazy(() =>
  import(/* webpackChunkName: 'Secrets.ViewSecrets' */ './ViewSecrets')
);
const ViewSecret = lazy(() =>
  import(/* webpackChunkName: 'Secrets.ViewSecret' */ './ViewSecret')
);
const description =
  'Manage secrets: values that can only be retrieved with the appropriate scopes.';

export default path => [
  {
    component: ViewSecret,
    path: `${path}/create`,
    isNewSecret: true,
    description,
  },
  {
    component: ViewSecret,
    path: `${path}/:secret`,
    description,
  },
  {
    component: ViewSecrets,
    path,
    description,
  },
];
