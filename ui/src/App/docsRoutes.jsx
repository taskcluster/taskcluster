import { DOCS_PATH_PREFIX } from '../utils/constants';
import lazy from '../utils/lazy';

const Documentation = lazy(() => import('../views/Documentation'));
const Profile = lazy(() => import('../views/Profile'));
const SwitchEntryPoint = lazy(() => import('../views/SwitchEntryPoint'));

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
  {
    component: SwitchEntryPoint,
    path: '/',
  },
];
