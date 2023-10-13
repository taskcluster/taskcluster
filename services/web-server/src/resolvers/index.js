import deepmerge from 'deepmerge';

import Root from './Root.js';
import Artifacts from './Artifacts.js';
import Auth from './Auth.js';
import CachePurges from './CachePurges.js';
import Clients from './Clients.js';
import Github from './Github.js';
import Hooks from './Hooks.js';
import Namespaces from './Namespaces.js';
import Notify from './Notify.js';
import Provisioners from './Provisioners.js';
import PulseMessages from './PulseMessages.js';
import Roles from './Roles.js';
import Scopes from './Scopes.js';
import Secrets from './Secrets.js';
import TaskRuns from './TaskRuns.js';
import TaskStatuses from './TaskStatuses.js';
import Tasks from './Tasks.js';
import WorkerManager from './WorkerManager.js';
import WorkerTypes from './WorkerTypes.js';
import Workers from './Workers.js';

const resolvers = deepmerge.all([
  Root,
  Artifacts,
  Auth,
  CachePurges,
  Clients,
  Github,
  Hooks,
  Namespaces,
  Notify,
  Provisioners,
  PulseMessages,
  Roles,
  Scopes,
  Secrets,
  TaskRuns,
  TaskStatuses,
  Tasks,
  WorkerManager,
  WorkerTypes,
  Workers,
]);

export default resolvers;
