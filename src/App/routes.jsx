import loadable from '../utils/loadable';

const Home = loadable(() =>
  import(/* webpackChunkName: 'Home' */ '../views/Home')
);
const Dashboard = loadable(() =>
  import(/* webpackChunkName: 'Dashboard' */ '../views/Dashboard')
);

export default [
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
    ),
    path: '/docs',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'AuthCallback' */ '../views/AuthCallback')
    ),
    path: '/login',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Tasks' */ '../views/Tasks')
    ),
    path: '/tasks',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Provisioners' */ '../views/Provisioners')
    ),
    path: '/provisioners',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Clients' */ '../views/Clients')
    ),
    path: '/auth/clients',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Roles' */ '../views/Roles')
    ),
    path: '/auth/roles',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Scopes' */ '../views/Scopes')
    ),
    path: '/auth/scopes',
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'Hooks' */ '../views/Hooks')
    ),
    path: '/hooks',
  },
  {
    // eslint-disable-next-line
    component: props =>
      props.user ? <Dashboard {...props} /> : <Home {...props} />,
    path: '/',
    exact: true,
  },
  {
    component: loadable(() =>
      import(/* webpackChunkName: 'NotFound' */ '../views/NotFound')
    ),
  },
];
