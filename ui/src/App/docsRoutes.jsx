import { join } from 'path';
import { Redirect } from 'react-router-dom';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import lazy from '../utils/lazy';

const Documentation = lazy(() => import('../views/Documentation'));
const Profile = lazy(() => import('../views/Profile'));
const SwitchEntryPoint = lazy(() => import('../views/SwitchEntryPoint'));

const DocsRedirect = ({ location, to }) => (
  <Redirect to={{ ...location, pathname: join(DOCS_PATH_PREFIX, to) }} />
);

DocsRedirect.preload = () => Promise.resolve();

export default [
  {
    component: DocsRedirect,
    path: join(DOCS_PATH_PREFIX, 'manual/deploying/workers'),
    exact: true,
    to: 'manual/deploying/worker-manager-config',
  },
  {
    component: Documentation,
    path: join(DOCS_PATH_PREFIX, ':path*'),
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
