import { join } from 'path';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import secretRoutes from '../views/Secrets/routes';
import scopeRoutes from '../views/Scopes/routes';
import taskRoutes from '../views/Tasks/routes';
import provisionerRoutes from '../views/Provisioners/routes';
import workerManagerRoutes from '../views/WorkerManager/routes';
import clientRoutes from '../views/Clients/routes';
import roleRoutes from '../views/Roles/routes';
import hookRoutes from '../views/Hooks/routes';
import denylistRoutes from '../views/Denylist/routes';
import cachePurgeRoutes from '../views/CachePurges/routes';
import lazy from '../utils/lazy';

const SwitchEntryPoint = lazy(() =>
  import(/* webpackChunkName: 'SwitchEntryPoint' */ '../views/SwitchEntryPoint')
);
const Tasks = lazy(() =>
  import(/* webpackChunkName: 'Tasks' */ '../views/Tasks')
);
const Provisioners = lazy(() =>
  import(/* webpackChunkName: 'Provisioners' */ '../views/Provisioners')
);
const Clients = lazy(() =>
  import(/* webpackChunkName: 'Clients' */ '../views/Clients')
);
const Roles = lazy(() =>
  import(/* webpackChunkName: 'Roles' */ '../views/Roles')
);
const Scopes = lazy(() =>
  import(/* webpackChunkName: 'Scopes' */ '../views/Scopes')
);
const Hooks = lazy(() =>
  import(/* webpackChunkName: 'Hooks' */ '../views/Hooks')
);
const WorkerManager = lazy(() =>
  import(/* webpackChunkName: 'Worker Manager' */ '../views/WorkerManager')
);
const Secrets = lazy(() =>
  import(/* webpackChunkName: 'Secrets' */ '../views/Secrets')
);
const CachePurges = lazy(() =>
  import(/* webpackChunkName: 'CachePurges' */ '../views/CachePurges')
);
const PulseMessages = lazy(() =>
  import(/* webpackChunkName: 'PulseMessages' */ '../views/PulseMessages')
);
const Quickstart = lazy(() =>
  import(/* webpackChunkName: 'Quickstart' */ '../views/Quickstart')
);
const Profile = lazy(() =>
  import(/* webpackChunkName: 'Profile' */ '../views/Profile')
);
const Shell = lazy(() =>
  import(/* webpackChunkName: 'Shell' */ '../views/Shell')
);
const HomeOrDashboard = lazy(() =>
  import(/* webpackChunkName: 'HomeOrDashboard' */ '../views/HomeOrDashboard')
);
const Denylist = lazy(() =>
  import(/* webpackChunkName: 'Denylist' */ '../views/Denylist')
);
const ThirdPartyLogin = lazy(() =>
  import(/* webpackChunkName: 'ThirdPartyLogin' */ '../views/ThirdPartyLogin')
);
const NotFound = lazy(() =>
  import(/* webpackChunkName: 'NotFound' */ '../views/NotFound')
);

export default [
  {
    component: SwitchEntryPoint,
    path: join(DOCS_PATH_PREFIX, ':path*'),
  },
  {
    component: Tasks,
    path: '/tasks',
    routes: taskRoutes('/tasks'),
  },
  {
    component: Provisioners,
    path: '/provisioners',
    routes: provisionerRoutes('/provisioners'),
  },
  {
    component: Clients,
    path: '/auth/clients',
    routes: clientRoutes('/auth/clients'),
  },
  {
    component: Roles,
    path: '/auth/roles',
    routes: roleRoutes('/auth/roles'),
  },
  {
    component: Scopes,
    path: '/auth/scopes',
    routes: scopeRoutes('/auth/scopes'),
  },
  {
    component: Hooks,
    path: '/hooks',
    routes: hookRoutes('/hooks'),
  },
  {
    component: WorkerManager,
    path: '/worker-manager',
    routes: workerManagerRoutes('/worker-manager'),
  },
  {
    component: Secrets,
    path: '/secrets',
    routes: secretRoutes('/secrets'),
  },
  {
    component: CachePurges,
    path: '/purge-caches',
    routes: cachePurgeRoutes('/purge-caches'),
  },
  {
    component: Denylist,
    path: '/notify/denylist',
    routes: denylistRoutes('/notify/denylist'),
  },
  {
    component: PulseMessages,
    path: '/pulse-messages',
  },
  {
    component: Quickstart,
    path: '/quickstart',
  },
  {
    component: Profile,
    path: '/profile',
  },
  {
    component: Shell,
    path: '/shell',
  },
  {
    component: ThirdPartyLogin,
    path: '/third-party',
  },
  {
    component: HomeOrDashboard,
    path: '/',
    exact: true,
  },
  {
    component: NotFound,
  },
];
