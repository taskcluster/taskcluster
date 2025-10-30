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

const SwitchEntryPoint = lazy(() => import('../views/SwitchEntryPoint'));
const Tasks = lazy(() => import('../views/Tasks'));
const Provisioners = lazy(() => import('../views/Provisioners'));
const Clients = lazy(() => import('../views/Clients'));
const Roles = lazy(() => import('../views/Roles'));
const Scopes = lazy(() => import('../views/Scopes'));
const Hooks = lazy(() => import('../views/Hooks'));
const WorkerManager = lazy(() => import('../views/WorkerManager'));
const Secrets = lazy(() => import('../views/Secrets'));
const CachePurges = lazy(() => import('../views/CachePurges'));
const PulseMessages = lazy(() => import('../views/PulseMessages'));
const Quickstart = lazy(() => import('../views/Quickstart'));
const TcYamlDebug = lazy(() => import('../views/TcYamlDebug'));
const Profile = lazy(() => import('../views/Profile'));
const Shell = lazy(() => import('../views/Shell'));
const HomeOrDashboard = lazy(() => import('../views/HomeOrDashboard'));
const Denylist = lazy(() => import('../views/Denylist'));
const ThirdPartyLogin = lazy(() => import('../views/ThirdPartyLogin'));
const NotFound = lazy(() => import('../views/NotFound'));

export default [
  {
    component: SwitchEntryPoint,
    path: `${DOCS_PATH_PREFIX}/:path*`,
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
    component: TcYamlDebug,
    path: '/tcyaml-debug',
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
