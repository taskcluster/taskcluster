import { MonitorManager } from '@taskcluster/lib-monitor';

MonitorManager.registerMetric('authSuccessTotal', {
  name: 'auth_success_total',
  type: 'counter',
  title: 'Total number of successful authentication attempts',
  description: 'Total number of successful authentication attempts',
  labels: {
    clientId: 'Client ID that authenticated',
    scheme: 'Authentication scheme (hawk, bewit, none)',
  },
});

MonitorManager.registerMetric('authFailureTotal', {
  name: 'auth_failure_total',
  type: 'counter',
  title: 'Total number of failed authentication attempts',
  description: 'Total number of failed authentication attempts',
  labels: {
    reason: 'Failure reason category',
    scheme: 'Attempted authentication scheme',
  },
});
