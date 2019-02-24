import views from './views';

export default path => [
  {
    component: views.ViewClient,
    path: `${path}/create`,
    isNewClient: true,
  },
  {
    component: views.ViewClient,
    path: `${path}/:clientId`,
  },
  {
    component: views.ViewClients,
    path,
    description:
      'Manage clients on the Auth service. This tool allows you to create, modify, and delete clients. You can also reset `accessToken` and explore indirect scopes.',
  },
];
