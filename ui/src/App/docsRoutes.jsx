import { join } from 'path';
import { DOCS_PATH_PREFIX } from '../utils/constants';
import views from './views';

export default [
  {
    component: views.Documentation,
    path: join(DOCS_PATH_PREFIX, ':path*'),
  },
  // Clicking on the logo for example should switch entry points
  {
    component: views.SwitchEntryPoint,
    path: '/',
  },
];
