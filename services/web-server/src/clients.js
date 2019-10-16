const {
  Auth,
  EC2Manager,
  Github,
  Hooks,
  Index,
  PurgeCache,
  Queue,
  QueueEvents,
  Secrets,
  Notify,
  WorkerManager,
} = require('taskcluster-client');

module.exports = options => ({
  auth: new Auth(options),
  ec2Manager: new EC2Manager(options),
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
