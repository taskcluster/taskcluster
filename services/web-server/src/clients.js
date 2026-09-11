import tc from '@taskcluster/client';
const { Auth, Github, Hooks, Index, PurgeCache, Queue, QueueEvents, Secrets, WorkerManager } = tc;

export default options => ({
  auth: new Auth(options),
  github: new Github(options),
  hooks: new Hooks(options),
  index: new Index(options),
  purgeCache: new PurgeCache(options),
  queue: new Queue(options),
  secrets: new Secrets(options),
  queueEvents: new QueueEvents(options),
  workerManager: new WorkerManager(options),
});
