import lazy from '../../utils/lazy';

const ViewDenylistAddress = lazy(() =>
  import(/* webpackChunkName: 'Denylist.ViewDenylistAddress' */ './ViewDenylistAddress')
);
const ViewDenylist = lazy(() =>
  import(/* webpackChunkName: 'Denylist.ViewDenylist' */ './ViewDenylist')
);

export default path => [
  {
    component: ViewDenylistAddress,
    path: `${path}/add`,
    isNewClient: true,
  },
  {
    component: ViewDenylistAddress,
    path: `${path}/:notificationAddress`,
  },
  {
    component: ViewDenylist,
    path,
    description:
      'Manage the notifications denylist. This page allows you to view, modify or delete the denylisted addresses.',
  },
];
