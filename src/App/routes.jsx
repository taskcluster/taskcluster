import { lazy } from 'react';

export default [
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
    ),
    path: '/docs',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Tasks' */ '../views/Tasks')
    ),
    path: '/tasks',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Provisioners' */ '../views/Provisioners')
    ),
    path: '/provisioners',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Clients' */ '../views/Clients')
    ),
    path: '/auth/clients',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Roles' */ '../views/Roles')
    ),
    path: '/auth/roles',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Scopes' */ '../views/Scopes')
    ),
    path: '/auth/scopes',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Hooks' */ '../views/Hooks')
    ),
    path: '/hooks',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'AWS Provisioner' */ '../views/AwsProvisioner')
    ),
    path: '/aws-provisioner',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Secrets' */ '../views/Secrets')
    ),
    path: '/secrets',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'CachePurges' */ '../views/CachePurges')
    ),
    path: '/purge-caches',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'PulseMessages' */ '../views/PulseMessages')
    ),
    path: '/pulse-messages',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Quickstart' */ '../views/Quickstart')
    ),
    path: '/quickstart',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Profile' */ '../views/Profile')
    ),
    path: '/profile',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Shell' */ '../views/Shell')
    ),
    path: '/shell',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Displays' */ '../views/Display')
    ),
    path: '/display',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'HomeOrDashboard' */ '../views/HomeOrDashboard')
    ),
    path: '/',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'NotFound' */ '../views/NotFound')
    ),
  },
];
