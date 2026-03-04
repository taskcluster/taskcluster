import '../../prelude.js';
import debugFactory from 'debug';
const debug = debugFactory('app:main');
import taskcluster from '@taskcluster/client';
import builder from './api.js';
import exchanges from './exchanges.js';
import Bucket from './bucket.js';
import QueueService from './queueservice.js';
import EC2RegionResolver from './ec2regionresolver.js';
import DeadlineResolver from './deadlineresolver.js';
import ClaimResolver from './claimresolver.js';
import WorkerRemovedResolver from './workerremovedresolver.js';
import DependencyTracker from './dependencytracker.js';
import DependencyResolver from './dependencyresolver.js';
import MetricsCollector from './metricscollector.js';
import WorkClaimer from './workclaimer.js';
import WorkerInfo from './workerinfo.js';
import loader from '@taskcluster/lib-loader';
import config from '@taskcluster/lib-config';
import { MonitorManager } from '@taskcluster/lib-monitor';
import SchemaSet from '@taskcluster/lib-validate';
import libReferences from '@taskcluster/lib-references';
import { App } from '@taskcluster/lib-app';
import tcdb from '@taskcluster/db';
import pulse from '@taskcluster/lib-pulse';
import QuickLRU from 'quick-lru';
import { artifactUtils } from './utils.js';
import { fileURLToPath } from 'url';

// default claim timeout to 20 minutes (in seconds)
const DEFAULT_CLAIM_TIMEOUT = 1200;
const DEFAULT_MAX_TASK_DEADLINE_DAYS = 5;

// default `expires`, `last_date_active` update frequency
const DEFAULT_UPDATE_FREQUENCY = '30 minutes';

// for supported bulk deletion S3 operations
const MAX_BULK_DELETE_SIZE = 1000;

// maximum number of records to process at once in claim, deadline, and dependency resolvers
// this is to limit total amount of concurrent updates to DB
const NUMBER_OF_RECORDS_TO_PROCESS = 32;

// maximum number of task dependencies to track
const DEFAULT_MAX_TASK_DEPENDENCIES = 10000;

import './monitor.js';

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

  workerManagerEvents: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.WorkerManagerEvents({
      rootUrl: cfg.taskcluster.rootUrl,
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

  // Create QueueService to manage internal queues
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
    setup: async ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('queue'), MonitorManager.metricsReference('queue')],
    }).then(ref => ref.generateReferences()),
  },

  api: {
    requires: [
      'cfg', 'publisher', 'schemaset', 'db', 'queueService',
      'publicArtifactBucket', 'privateArtifactBucket',
      'regionResolver', 'monitor', 'dependencyTracker',
      'workClaimer', 'workerInfo', 'objectService',
    ],
    setup: (ctx) => {
      const monitor = ctx.monitor.childMonitor('api');
      const api = builder.build({
        context: {
          db: ctx.db,
          taskGroupExpiresExtension: ctx.cfg.app.taskGroupExpiresExtension,
          dependencyTracker: ctx.dependencyTracker,
          publisher: ctx.publisher,
          claimTimeout: ctx.cfg.app.claimTimeout || DEFAULT_CLAIM_TIMEOUT,
          maxTaskDeadlineDays: ctx.cfg.app.maxTaskDeadlineDays || DEFAULT_MAX_TASK_DEADLINE_DAYS,
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
          taskMaxDependencies: Math.min(
            ctx.cfg.app.taskMaxDependencies ?? DEFAULT_MAX_TASK_DEPENDENCIES,
            DEFAULT_MAX_TASK_DEPENDENCIES,
          ),
        },
        rootUrl: ctx.cfg.taskcluster.rootUrl,
        schemaset: ctx.schemaset,
        monitor,
      });

      monitor.exposeMetrics('default');
      return api;
    },
  },

  // Create the server process
  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      keepAliveTimeoutSeconds: cfg.server.keepAliveTimeoutSeconds,
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
        count: NUMBER_OF_RECORDS_TO_PROCESS,
        monitor: monitor.childMonitor('claim-resolver'),
      });
      await resolver.start();
      monitor.exposeMetrics('resolvers');
      return resolver;
    },
  },

  // Create the worker-removed-resolver process
  'worker-removed-resolver': {
    requires: [
      'cfg', 'db', 'queueService', 'publisher', 'monitor',
      'dependencyTracker', 'pulseClient', 'workerManagerEvents',
    ],
    setup: async ({
      db, queueService, publisher, dependencyTracker,
      monitor, pulseClient, workerManagerEvents,
    }) => {
      let resolver = new WorkerRemovedResolver({
        db, queueService, publisher, dependencyTracker,
        pulseClient, workerManagerEvents,
        monitor: monitor.childMonitor('worker-removed-resolver'),
      });
      await resolver.start();
      monitor.exposeMetrics('resolvers');
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
        count: NUMBER_OF_RECORDS_TO_PROCESS,
        monitor: monitor.childMonitor('deadline-resolver'),
      });
      await resolver.start();
      monitor.exposeMetrics('resolvers');
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
        count: NUMBER_OF_RECORDS_TO_PROCESS,
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
        const useBulkDelete = !!cfg.aws.useBulkDelete;
        // when using bulk delete, maximum number of objects in bulk request is 1000
        // if using single delete, we have to be cautious not to overload the API with too many parallel requests
        // so we limit the batch size to 100 by default, which proved to be a good value in production
        const expireArtifactsBatchSize = useBulkDelete ? MAX_BULK_DELETE_SIZE : (cfg.expireArtifactsBatchSize || 100);

        debug('Expiring artifacts at: %s, from before %s, useBulkDelete: %s, batchSize: %d',
          new Date(), now, useBulkDelete, expireArtifactsBatchSize);

        const { count, errorsCount } = await artifactUtils.expire({
          db,
          publicBucket: publicArtifactBucket,
          privateBucket: privateArtifactBucket,
          monitor,
          ignoreError: false,
          expires: now,
          expireArtifactsBatchSize,
          useBulkDelete,
        });
        debug('Expired %s artifacts (%s errors)', count, errorsCount);
        monitor.log.expiredArtifactsRemoved({ count, errorsCount, expires: now });
      });
    },
  },

  // Create the queue-message expiration process (periodic job)
  'expire-queue-messages': {
    requires: ['cfg', 'queueService', 'monitor'],
    setup: ({ cfg, queueService, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Expiring pending messages at: %s', new Date());
        await queueService.deleteExpired();
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

  // Create the worker metrics collection process (continuous background job)
  'queue-metrics': {
    requires: ['cfg', 'db', 'monitor', 'queueService'],
    setup: async ({ cfg, db, monitor, queueService }, ownName) => {
      /** @type {import('@taskcluster/lib-monitor').Monitor} */
      const childMonitor = monitor.childMonitor('queue-metrics');
      const collector = new MetricsCollector({
        ownName,
        db,
        queueService,
        monitor: childMonitor,
        pollingDelay: cfg.app.workerMetrics?.pollingDelay || 30000,
      });
      await collector.start();
      childMonitor.exposeMetrics('totals');
      return collector;
    },
  },

}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
