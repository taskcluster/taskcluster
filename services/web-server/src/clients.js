import {
  Auth,
  Github,
  Hooks,
  Index,
  PurgeCache,
  Queue,
  QueueEvents,
  Secrets,
  Notify,
  WorkerManager,
} from 'taskcluster-client';

export default options => ({
  auth: new Auth(options),
  github: new Github(options),
  hooks: new Hooks(options),
  index: new Index(options),
  purgeCache: new PurgeCache(options),
  queue: new Queue(options),
  secrets: new Secrets(options),
  queueEvents: new QueueEvents(options),
  notify: new Notify(options),
  workerManager: new WorkerManager(options),
});
