import { join } from 'path';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import lazy from '../utils/lazy';

const Documentation = lazy(() =>
  import(/* webpackChunkName: 'Documentation' */ '../views/Documentation')
);
const SwitchEntryPoint = lazy(() =>
  import(/* webpackChunkName: 'SwitchEntryPoint' */ '../views/SwitchEntryPoint')
);

export default [
  {
    component: Documentation,
    path: join(DOCS_PATH_PREFIX, ':path*'),
  },
  // Clicking on the logo for example should switch entry points
  {
    component: SwitchEntryPoint,
    path: '/',
  },
];
