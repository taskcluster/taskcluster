import { DOCS_PATH_PREFIX } from '../utils/constants';
import lazy from '../utils/lazy';

const Documentation = lazy(() =>
  import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
);
const Profile = lazy(() =>
  import(/* webpackChunkName: 'Profile' */ '../views/Profile')
);
const SwitchEntryPoint = lazy(() =>
  import(/* webpackChunkName: 'SwitchEntryPoint' */ '../views/SwitchEntryPoint')
);

export default [
  {
    component: Documentation,
    path: `${DOCS_PATH_PREFIX}/:path*`,
  },

  {
    component: Profile,
    path: '/profile',
  },
  // Clicking on the logo for example should switch entry points
  // {
  //   component: SwitchEntryPoint,
  //   path: '/',
  // },
];
