import { lazy } from 'react';
import { join } from 'path';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import views from './views';
import secretRoutes from '../views/Secrets/routes';
import scopeRoutes from '../views/Scopes/routes';
import taskRoutes from '../views/Tasks/routes';
import provisionerRoutes from '../views/Provisioners/routes';
import clientRoutes from '../views/Clients/routes';
import roleRoutes from '../views/Roles/routes';
import hookRoutes from '../views/Hooks/routes';
import awsProvisionerRoutes from '../views/AwsProvisioner/routes';
import cachePurgeRoutes from '../views/CachePurges/routes';

export default [
  {
    component: views.SwitchEntryPoint,
    path: join(DOCS_PATH_PREFIX, ':path*'),
  },
  {
    component: views.Tasks,
    path: '/tasks',
    routes: taskRoutes('/tasks'),
  },
  {
    component: views.Provisioners,
    path: '/provisioners',
    routes: provisionerRoutes('/provisioners'),
  },
  {
    component: views.Clients,
    path: '/auth/clients',
    routes: clientRoutes('/auth/clients'),
  },
  {
    component: views.Roles,
    path: '/auth/roles',
    routes: roleRoutes('/auth/roles'),
  },
  {
    component: views.Scopes,
    path: '/auth/scopes',
    routes: scopeRoutes('/auth/scopes'),
  },
  {
    component: views.Hooks,
    path: '/hooks',
    routes: hookRoutes('/hooks'),
  },
  {
    component: views.AwsProvisioner,
    path: '/aws-provisioner',
    routes: awsProvisionerRoutes('/aws-provisioner'),
  },
  {
    component: views.Secrets,
    path: '/secrets',
    routes: secretRoutes('/secrets'),
  },
  {
    component: views.CachePurges,
    path: '/purge-caches',
    route: cachePurgeRoutes('/purge-caches'),
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
