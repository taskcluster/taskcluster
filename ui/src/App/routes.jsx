import { lazy } from 'react';
import { join } from 'path';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import views from './views';

export default [
  {
    component: views.SwitchEntryPoint,
    path: join(DOCS_PATH_PREFIX, ':path*'),
  },
  {
    component: views.Tasks,
    path: '/tasks',
  },
  {
    component: views.Provisioners,
    path: '/provisioners',
  },
  {
    component: views.Clients,
    path: '/auth/clients',
  },
  {
    component: views.Roles,
    path: '/auth/roles',
  },
  {
    component: views.Scopes,
    path: '/auth/scopes',
  },
  {
    component: views.Hooks,
    path: '/hooks',
  },
  {
    component: views.AwsProvisioner,
    path: '/aws-provisioner',
  },
  {
    component: views.Secrets,
    path: '/secrets',
  },
  {
    component: views.CachePurges,
    path: '/purge-caches',
  },
  {
    component: views.PulseMessages,
    path: '/pulse-messages',
  },
  {
    component: views.Quickstart,
    path: '/quickstart',
  },
  {
    component: views.Profile,
    path: '/profile',
  },
  {
    component: lazy(() =>
      import(/* webpackChunkName: 'Shell' */ '../views/Shell')
    ),
    path: '/shell',
  },
  {
    component: views.Display,
    path: '/display',
  },
  {
    component: views.HomeOrDashboard,
    path: '/',
    exact: true,
  },
  {
    component: views.NotFound,
  },
];
