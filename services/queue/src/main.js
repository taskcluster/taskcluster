require('../../prelude');
let debug = require('debug')('app:main');
let taskcluster = require('taskcluster-client');
let builder = require('./api');
let exchanges = require('./exchanges');
let Bucket = require('./bucket');
let QueueService = require('./queueservice');
let EC2RegionResolver = require('./ec2regionresolver');
let DeadlineResolver = require('./deadlineresolver');
let ClaimResolver = require('./claimresolver');
let DependencyTracker = require('./dependencytracker');
let DependencyResolver = require('./dependencyresolver');
let WorkClaimer = require('./workclaimer');
let WorkerInfo = require('./workerinfo');
let loader = require('taskcluster-lib-loader');
let config = require('taskcluster-lib-config');
let { MonitorManager } = require('taskcluster-lib-monitor');
let SchemaSet = require('taskcluster-lib-validate');
let libReferences = require('taskcluster-lib-references');
let { App } = require('taskcluster-lib-app');
const tcdb = require('taskcluster-db');
let pulse = require('taskcluster-lib-pulse');
const QuickLRU = require('quick-lru');
const { artifactUtils } = require('./utils');

// default claim timeout to 20 minutes (in seconds)
const DEFAULT_CLAIM_TIMEOUT = 1200;

// default `expires`, `last_date_active` update frequency
const DEFAULT_UPDATE_FREQUENCY = '30 minutes';

require('./monitor');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'queue',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'queue',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  // Validator and publisher
  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'queue',
    }),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new pulse.Client({
        namespace: 'taskcluster-queue',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({ cfg, schemaset, pulseClient }) => exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
    }),
  },

  // Create artifact bucket instances
  publicArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({ cfg, monitor }) => {
      let bucket = new Bucket({
        bucket: cfg.app.publicArtifactBucket,
        awsOptions: cfg.aws,
        bucketCDN: cfg.app.publicArtifactBucketCDN,
        monitor: monitor.childMonitor('public-bucket'),
      });
      await bucket.setupCORSIfNecessary();
      return bucket;
    },
  },
  privateArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({ cfg, monitor }) => {
      let bucket = new Bucket({
        bucket: cfg.app.privateArtifactBucket,
        awsOptions: cfg.aws,
        monitor: monitor.childMonitor('private-bucket'),
      });
      await bucket.setupCORSIfNecessary();
      return bucket;
    },
  },

  objectService: {
    requires: ["cfg"],
    setup: ({ cfg }) => new taskcluster.Object({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'queue',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  // Create QueueService to manage azure queues
  queueService: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({ cfg, monitor, db }) => new QueueService({
      db,
      claimQueue: cfg.app.claimQueue,
      resolvedQueue: cfg.app.resolvedQueue,
      deadlineQueue: cfg.app.deadlineQueue,
      deadlineDelay: cfg.app.deadlineDelay,
      monitor: monitor.childMonitor('queue-service'),
    }),
  },

  // Create workClaimer
  workClaimer: {
    requires: ['cfg', 'publisher', 'db', 'queueService', 'monitor'],
    setup: ({ cfg, publisher, db, queueService, monitor }) => new WorkClaimer({
      publisher,
      db,
      queueService,
      monitor: monitor.childMonitor('work-claimer'),
      claimTimeout: cfg.app.claimTimeout || DEFAULT_CLAIM_TIMEOUT,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  // Create workerInfo
  workerInfo: {
    requires: ['cfg', 'db'],
    setup: ({ cfg, db }) => new WorkerInfo({
      db,
      workerInfoUpdateFrequency: cfg.app.workerInfoUpdateFrequency || DEFAULT_UPDATE_FREQUENCY,
    }),
  },

  // Create dependencyTracker
  dependencyTracker: {
    requires: [
      'publisher', 'queueService', 'monitor', 'db',
    ],
    setup: ({ monitor, ...ctx }) => new DependencyTracker({
      monitor: monitor.childMonitor('dependency-tracker'),
      ...ctx },
    ),
  },

  // Create EC2RegionResolver for regions we have artifact proxies in
  regionResolver: {
    requires: ['cfg', 'monitor'],
    setup: async ({ cfg, monitor }) => {
      let regionResolver = new EC2RegionResolver([cfg.aws.region], monitor);
      regionResolver.start();
      return regionResolver;
    },
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('queue')],
    }).generateReferences(),
  },

  api: {
    requires: [
      'cfg', 'publisher', 'schemaset', 'db', 'queueService',
      'publicArtifactBucket', 'privateArtifactBucket',
      'regionResolver', 'monitor', 'dependencyTracker',
      'workClaimer', 'workerInfo', 'objectService',
    ],
    setup: (ctx) => builder.build({
      context: {
        db: ctx.db,
        taskGroupExpiresExtension: ctx.cfg.app.taskGroupExpiresExtension,
        dependencyTracker: ctx.dependencyTracker,
        publisher: ctx.publisher,
        claimTimeout: ctx.cfg.app.claimTimeout || DEFAULT_CLAIM_TIMEOUT,
        queueService: ctx.queueService,
        signPublicArtifactUrls: !!ctx.cfg.app.signPublicArtifactUrls,
        publicBucket: ctx.publicArtifactBucket,
        privateBucket: ctx.privateArtifactBucket,
        regionResolver: ctx.regionResolver,
        credentials: ctx.cfg.taskcluster.credentials,
        artifactRegion: ctx.cfg.aws.region,
        monitor: ctx.monitor.childMonitor('api-context'),
        workClaimer: ctx.workClaimer,
        workerInfo: ctx.workerInfo,
        LRUcache: new QuickLRU({ maxSize: ctx.cfg.app.taskCacheMaxSize || 10 }),
        objectService: ctx.objectService,
      },
      rootUrl: ctx.cfg.taskcluster.rootUrl,
      schemaset: ctx.schemaset,
      monitor: ctx.monitor.childMonitor('api'),
    }),
  },

  // Create the server process
  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  // Create the claim-resolver process
  'claim-resolver': {
    requires: [
      'cfg', 'db', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: async ({
      cfg, db, queueService, publisher, dependencyTracker, monitor,
    }, ownName) => {
      let resolver = new ClaimResolver({
        ownName,
        db, queueService, publisher, dependencyTracker,
        pollingDelay: cfg.app.claimResolver.pollingDelay,
        parallelism: cfg.app.claimResolver.parallelism,
        monitor: monitor.childMonitor('claim-resolver'),
      });
      await resolver.start();
      return resolver;
    },
  },

  // Create the deadline reaper process
  'deadline-resolver': {
    requires: [
      'cfg', 'db', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: async ({
      cfg, db, queueService, publisher, dependencyTracker, monitor,
    }, ownName) => {
      let resolver = new DeadlineResolver({
        ownName,
        db, queueService, publisher, dependencyTracker,
        pollingDelay: cfg.app.deadlineResolver.pollingDelay,
        parallelism: cfg.app.deadlineResolver.parallelism,
        monitor: monitor.childMonitor('deadline-resolver'),
      });
      await resolver.start();
      return resolver;
    },
  },

  // Create the dependency-resolver process
  'dependency-resolver': {
    requires: ['cfg', 'queueService', 'dependencyTracker', 'monitor'],
    setup: async ({ cfg, queueService, dependencyTracker, monitor }, ownName) => {
      let resolver = new DependencyResolver({
        ownName,
        queueService, dependencyTracker,
        pollingDelay: cfg.app.dependencyResolver.pollingDelay,
        monitor: monitor.childMonitor('dependency-resolver'),
      });
      await resolver.start();
      return resolver;
    },
  },

  // Create the artifact expiration process (periodic job)
  'expire-artifacts': {
    requires: ['cfg', 'db', 'publicArtifactBucket', 'privateArtifactBucket', 'monitor'],
    setup: ({ cfg, db, publicArtifactBucket, privateArtifactBucket, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.artifactExpirationDelay);
        debug('Expiring artifacts at: %s, from before %s', new Date(), now);
        const count = await artifactUtils.expire({
          db,
          publicBucket: publicArtifactBucket,
          privateBucket: privateArtifactBucket,
          monitor,
          ignoreError: true,
          expires: now,
        });
        // const count = await Artifact.expire(now);
        debug('Expired %s artifacts', count);
      });
    },
  },

  // Create the queue-message expiration process (periodic job)
  'expire-queue-messages': {
    requires: ['cfg', 'queueService', 'monitor'],
    setup: ({ cfg, queueService, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Expiring azqueue messages at: %s', new Date());
        await queueService.deleteExpiredMessages();
      });
    },
  },

  // Create the task expiration process (periodic job)
  'expire-tasks': {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring tasks at: %s, from before %s', new Date(), now);
        const [{ expire_tasks }] = await db.fns.expire_tasks(now);
        debug('Expired %s tasks', expire_tasks);
      });
    },
  },

  // Create the task-group expiration process (periodic job)
  'expire-task-groups': {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-groups at: %s, from before %s', new Date(), now);
        const [{ expire_task_groups }] = await db.fns.expire_task_groups(now);
        debug('Expired %s task-groups', expire_task_groups);
      });
    },
  },

  // Create the task-dependency expiration process (periodic job)
  'expire-task-dependency': {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-dependency at: %s, from before %s', new Date(), now);
        const [{ expire_task_dependencies }] = await db.fns.expire_task_dependencies(now);
        debug('Expired %s task-dependency', expire_task_dependencies);
      });
    },
  },

  // Create the worker-info expiration process (periodic job)
  'expire-worker-info': {
    requires: ['cfg', 'workerInfo', 'monitor'],
    setup: ({ cfg, workerInfo, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.workerInfoExpirationDelay);
        debug('Expiring worker-info at: %s, from before %s', new Date(), now);
        const count = await workerInfo.expire(now);
        debug('Expired %s worker-info', count);
      });
    },
  },

  // Create the load-test process (run as one-off job)
  'load-test': {
    requires: ['cfg'],
    setup: ({ cfg }) => require('./load-test')(cfg),
  },

}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}

module.exports = load;
