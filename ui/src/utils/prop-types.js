import {
  arrayOf,
  bool,
  instanceOf,
  array,
  number,
  object,
  oneOf,
  oneOfType,
  shape,
  string,
} from 'prop-types';
import { DENYLIST_NOTIFICATION_TYPES } from './constants';

export const user = shape({
  name: string,
  nickname: string,
  picture: string,
  sub: string,
});

export const date = oneOfType([string, instanceOf(Date)]);

export const route = shape({
  path: string,
  component: object,
});

export const pageInfo = shape({
  hasNextPage: bool,
  hasPreviousPage: bool,
  cursor: string,
  previousCursor: string,
  nextCursor: string,
});

export const docsPageTransition = shape({
  title: string,
  path: string,
});

export const docsPageMetadata = shape({
  followup: shape({
    subtext: string,
    links: object,
  }),
  filename: string,
  order: number,
  title: string,
});

export const docsPageInfo = shape({
  children: array,
  data: docsPageMetadata,
  name: string,
  path: string,
  next: docsPageTransition,
  prev: docsPageTransition,
  up: docsPageTransition,
});

export const artifact = shape({
  name: string,
  contentType: string,
  url: string,
  isPublic: bool,
});

export const artifacts = shape({
  pageInfo,
  edges: arrayOf(artifact),
});

export const run = shape({
  taskId: string,
  state: string,
  reasonCreated: string,
  scheduled: date,
  started: date,
  workerGroup: string,
  workerId: string,
  takenUntil: date,
  artifacts,
});

export const runs = arrayOf(run);

export const taskState = oneOf([
  'RUNNING',
  'PENDING',
  'UNSCHEDULED',
  'COMPLETED',
  'FAILED',
  'EXCEPTION',
]);

export const status = shape({
  state: taskState,
  retriesLeft: number,
  runs,
});

export const provisionerAction = shape({
  name: string,
  title: string,
  context: oneOf(['PROVISIONER', 'WORKER_TYPE', 'WORKER']),
  url: string,
  method: oneOf(['POST', 'PUT', 'DELETE', 'PATCH']),
  description: string,
});

export const stability = oneOf(['EXPERIMENTAL', 'STABLE', 'DEPRECATED']);

export const taskMetadata = shape({
  name: string,
  description: string,
  owner: string,
  source: string,
});

export const taskPriority = oneOf([
  'HIGHEST',
  'VERY_HIGH',
  'HIGH',
  'MEDIUM',
  'LOW',
  'VERY_LOW',
  'LOWEST',
  'NORMAL',
]);

export const taskActions = shape({
  actions: arrayOf(object),
  variables: object,
  version: number,
});

export const task = shape({
  metadata: taskMetadata,
  retries: number,
  created: date,
  deadline: date,
  expires: date,
  priority: taskPriority,
  provisionerId: string,
  workerType: string,
  schedulerId: string,
  dependencies: arrayOf(string),
  tags: object,
  scopes: arrayOf(string),
  routes: arrayOf(string),
  payload: object,
  extra: object,
  status,
  taskActions,
  latestArtifacts: artifacts,
});

Object.assign(task, { taskGroup: task });

const taskRun = shape({
  taskId: string,
  runId: number,
  run,
});

export const worker = shape({
  provisionerId: string,
  workerType: string,
  workerGroup: string,
  workerId: string,
  recentTasks: arrayOf(taskRun),
  expires: date,
  quarantineUntil: date,
  latestTasks: arrayOf(task),
  actions: arrayOf(provisionerAction),
});

export const workers = shape({
  pageInfo,
  edges: arrayOf(worker),
});

export const WMError = shape({
  errorId: string,
  title: string,
  description: string,
  reported: date,
  extra: object,
});

export const WMWorker = shape({
  workerId: string,
  workerGroup: string,
  workerAge: date,

  latestTask: shape({
    taskId: string,
    runId: number,
    state: string,
    reasonResolved: string,
    scheduled: date,
    started: date,
    resolved: date,
  }),

  quarantineUntil: date,

  recentErrors: number,

  providerId: string,
  workerType: string,
});

export const workerType = shape({
  provisionerId: string,
  workerType: string,
  stability,
  description: string,
  expires: date,
  lastDateActive: date,
  actions: arrayOf(provisionerAction),
});

export const WorkerManagerWorkerPoolSummary = shape({
  workerPoolId: string,
  providerId: string,
  description: string,
  created: date,
  lastModified: date,
  config: object,
  owner: string,
  emailOnError: bool,
  pendingTasks: number,
});

export const providersArray = arrayOf(
  shape({
    providerId: string,
    providerType: string,
  })
);

export const provisioner = shape({
  provisionerId: string,
  stability,
  description: string,
  expires: date,
  lastDateActive: date,
  actions: arrayOf(provisionerAction),
});

export const client = shape({
  clientId: string,
  expires: date,
  deleteOnExpiration: bool,
  description: string,
  created: date,
  lastModified: date,
  lastDateUsed: date,
  lastRotated: date,
  scopes: arrayOf(string),
  expandedScopes: arrayOf(string),
  disabled: bool,
});

export const role = shape({
  roleId: string,
  scopes: arrayOf(string),
  description: string,
  created: date,
  lastModified: date,
  expandedScopes: arrayOf(string),
});

export const hookMetadata = shape({
  name: string,
  description: string,
  owner: string,
  emailOnError: bool,
});

export const hookTask = shape({
  provisionerId: string,
  workerType: string,
  schedulerId: string,
  taskGroupId: string,
  routes: arrayOf(string),
  priority: taskPriority,
  retries: number,
  scopes: arrayOf(string),
  payload: object,
  metadata: taskMetadata,
  tags: object,
  extra: object,
});

export const hook = shape({
  hookGroupId: string,
  hookId: string,
  metadata: hookMetadata,
  schedule: arrayOf(string),
  task: hookTask,
  expires: date,
  deadline: date,
  triggerSchema: object,
});

export const secret = shape({
  secret: object,
  expires: date,
});
export const secrets = arrayOf(
  shape({
    name: string,
  })
);

export const notificationType = oneOf(
  Object.values(DENYLIST_NOTIFICATION_TYPES)
);

export const notificationAddress = shape({
  notificationType,
  notificationAddress: string,
});

export const namespace = shape({
  name: string,
  namespace: string,
  expires: date,
});

export const indexedTask = shape({
  namespace: string,
  taskId: string,
  rank: number,
  data: object,
  expires: date,
});

export const cachePurge = shape({
  provisionerId: string,
  workerType: string,
  cacheName: string,
  before: date,
});

export const pulseMessage = shape({
  payload: object,
  exchange: string,
  routingKey: string,
  redelivered: bool,
  cc: string,
});

// https://developers.google.com/analytics/devguides/collection/analyticsjs/events
export const gaEvent = shape({
  /**
   * Defaults to 'Click'.
   * A description of the behaviour.
   * E.g. 'Clicked Delete', 'Added a component', 'Deleted account', etc.
   * */
  action: string,
  /**
   * More precise labelling of the related action.
   * E.g. alongside the 'Added a component' action, we could add the name
   * of a component as the label. E.g. 'Survey', 'Heading', 'Button', etc.
   * */
  label: string,
  /**
   * Defaults to 'Uncategorized'.
   * A top level category for the event.
   * E.g. 'User', 'Navigation', 'App Editing', etc.
   * */
  category: string,
  /**
   * A means of recording a numerical value against an event.
   * E.g. a rating, a score, etc.
   */
  value: number,
  /**
   * If an event is not triggered by a user interaction, but instead by the
   * code (e.g. on page load),
   * it should be flagged as a nonInteraction event to avoid
   * skewing bounce rate data.
   */
  nonInteraction: bool,
  /**
   * This specifies the transport mechanism with which hits will be sent.
   * Valid values include 'beacon', 'xhr', or 'image'.
   */
  transport: string,
});
