import lazy from '../utils/lazy';
import taskViews from '../views/Tasks/views';
import secretViews from '../views/Secrets/views';
import scopeViews from '../views/Scopes/views';
import roleViews from '../views/Roles/views';
import provisionerViews from '../views/Provisioners/views';
import hookViews from '../views/Hooks/views';
import clientViews from '../views/Clients/views';
import cachePurgeViews from '../views/CachePurges/views';
import awsProvisionerViews from '../views/AwsProvisioner/views';

export default {
  SwitchEntryPoint: lazy(() =>
    import(/* webpackChunkName: 'SwitchEntryPoint' */ '../views/SwitchEntryPoint')
  ),
  Tasks: lazy(() => import(/* webpackChunkName: 'Tasks' */ '../views/Tasks')),
  Provisioners: lazy(() =>
    import(/* webpackChunkName: 'Provisioners' */ '../views/Provisioners')
  ),
  Clients: lazy(() =>
    import(/* webpackChunkName: 'Clients' */ '../views/Clients')
  ),
  Roles: lazy(() => import(/* webpackChunkName: 'Roles' */ '../views/Roles')),
  Scopes: lazy(() =>
    import(/* webpackChunkName: 'Scopes' */ '../views/Scopes')
  ),
  Hooks: lazy(() => import(/* webpackChunkName: 'Hooks' */ '../views/Hooks')),
  AwsProvisioner: lazy(() =>
    import(/* webpackChunkName: 'AWS Provisioner' */ '../views/AwsProvisioner')
  ),
  Secrets: lazy(() =>
    import(/* webpackChunkName: 'Secrets' */ '../views/Secrets')
  ),
  CachePurges: lazy(() =>
    import(/* webpackChunkName: 'CachePurges' */ '../views/CachePurges')
  ),
  PulseMessages: lazy(() =>
    import(/* webpackChunkName: 'PulseMessages' */ '../views/PulseMessages')
  ),
  Quickstart: lazy(() =>
    import(/* webpackChunkName: 'Quickstart' */ '../views/Quickstart')
  ),
  Profile: lazy(() =>
    import(/* webpackChunkName: 'Profile' */ '../views/Profile')
  ),
  Shell: lazy(() => import(/* webpackChunkName: 'Shell' */ '../views/Shell')),
  Display: lazy(() =>
    import(/* webpackChunkName: 'Displays' */ '../views/Display')
  ),
  HomeOrDashboard: lazy(() =>
    import(/* webpackChunkName: 'HomeOrDashboard' */ '../views/HomeOrDashboard')
  ),
  NotFound: lazy(() =>
    import(/* webpackChunkName: 'NotFound' */ '../views/NotFound')
  ),
  Documentation: lazy(() =>
    import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
  ),
  ...taskViews,
  ...secretViews,
  ...scopeViews,
  ...roleViews,
  ...provisionerViews,
  ...hookViews,
  ...clientViews,
  ...cachePurgeViews,
  ...awsProvisionerViews,
};
