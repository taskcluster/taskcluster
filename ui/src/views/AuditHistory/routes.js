import lazy from '../../utils/lazy';

const ViewAuditHistory = lazy(
  () =>
    import(/* webpackChunkName: 'Clients.ViewClient' */ './ViewAuditHistory')
);

const ViewClientAuditHistory = lazy(
  () =>
    import(
      /* webpackChunkName: 'Clients.ViewClient' */ './ViewClientAuditHistory'
    )
);

export default path => [
  {
    component: ViewClientAuditHistory,
    path: `${path}/client/history/:clientId`,
  },
  {
    component: ViewAuditHistory,
    path: `${path}/:entityType/:entityId`,
  },
];
