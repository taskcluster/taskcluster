import lazy from '../../utils/lazy';

const ViewDenylistAddress = lazy(() =>
  import(
    /* webpackChunkName: 'Denylist.ViewDenylistAddress' */ './ViewDenylistAddress'
  )
);
const ViewDenylistAddresses = lazy(() =>
  import(
    /* webpackChunkName: 'Denylist.ViewDenylistAddresses' */ './ViewDenylistAddresses'
  )
);

export default path => [
  {
    component: ViewDenylistAddress,
    path: `${path}/add`,
    isNewAddress: true,
  },
  {
    component: ViewDenylistAddress,
    path: `${path}/:notificationAddress`,
  },
  {
    component: ViewDenylistAddresses,
    path,
    description:
      'Manage the notifications denylist. This page allows you to view or delete the denylisted notification addresses.',
  },
];
