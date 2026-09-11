import artifacts from './artifacts.js';
import auth from './auth.js';
import cachePurges from './cachePurges.js';
import clients from './clients.js';
import hooks from './hooks.js';
import roles from './roles.js';
import scopes from './scopes.js';
import secrets from './secrets.js';
import taskStatuses from './taskStatuses.js';
import tasks from './tasks.js';
import workerManager from './workerManager.js';
import workerTypes from './workerTypes.js';

const loaders = [
  artifacts,
  auth,
  cachePurges,
  clients,
  hooks,
  roles,
  scopes,
  secrets,
  taskStatuses,
  tasks,
  workerManager,
  workerTypes,
];

export default (clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId) =>
  Object.assign(
    {},
    ...loaders.map(loader => loader(clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId))
  );
