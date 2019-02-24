import views from './views';

const description =
  'Manage secrets: values that can only be retrieved with the appropriate scopes.';

export default path => [
  {
    component: views.ViewSecret,
    path: `${path}/create`,
    isNewSecret: true,
    description,
  },
  {
    component: views.ViewSecret,
    path: `${path}/:secret`,
    description,
  },
  {
    component: views.ViewSecrets,
    path,
    description,
  },
];
