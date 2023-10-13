import artifacts from './artifacts.js';
import auth from './auth.js';
import cachePurges from './cachePurges.js';
import clients from './clients.js';
import github from './github.js';
import hooks from './hooks.js';
import namespaces from './namespaces.js';
import notify from './notify.js';
import provisioners from './provisioners.js';
import roles from './roles.js';
import scopes from './scopes.js';
import secrets from './secrets.js';
import taskStatuses from './taskStatuses.js';
import tasks from './tasks.js';
import workerManager from './workerManager.js';
import workerTypes from './workerTypes.js';
import workers from './workers.js';

const loaders = [
  artifacts,
  auth,
  cachePurges,
  clients,
  github,
  hooks,
  namespaces,
  notify,
  provisioners,
  roles,
  scopes,
  secrets,
  taskStatuses,
  tasks,
  workerManager,
  workerTypes,
  workers,
];

export default (clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId) =>
  loaders.reduce(
    (loaders, loader) => ({
      ...loaders,
      ...loader(clients, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId, traceId),
    }),
    {},
  );
