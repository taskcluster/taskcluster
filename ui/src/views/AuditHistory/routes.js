import lazy from '../../utils/lazy';

const ViewAuditHistory = lazy(() =>
  import(/* webpackChunkName: 'Clients.ViewClient' */ './ViewAuditHistory')
);

export default path => [
  {
    component: ViewAuditHistory,
    path: `${path}/:entityType/:entityId`,
  },
];
