require('../../prelude');
let debug = require('debug')('app:main');
let taskcluster = require('taskcluster-client');
let builder = require('./api');
let exchanges = require('./exchanges');
let data = require('./data');
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
let {MonitorManager} = require('taskcluster-lib-monitor');
let SchemaSet = require('taskcluster-lib-validate');
let libReferences = require('taskcluster-lib-references');
let {App} = require('taskcluster-lib-app');
const tcdb = require('taskcluster-db');
let pulse = require('taskcluster-lib-pulse');
const QuickLRU = require('quick-lru');

require('./monitor');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({
      profile,
      serviceName: 'queue',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'queue',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  // Validator and publisher
  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'queue',
    }),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new pulse.Client({
        namespace: 'taskcluster-queue',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({cfg, schemaset, pulseClient}) => exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
    }),
  },

  // Create artifact bucket instances
  publicArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let bucket = new Bucket({
        bucket: cfg.app.publicArtifactBucket,
        credentials: cfg.aws,
        bucketCDN: cfg.app.publicArtifactBucketCDN,
        monitor: monitor.childMonitor('public-bucket'),
      });
      await bucket.setupCORS();
      return bucket;
    },
  },
  privateArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let bucket = new Bucket({
        bucket: cfg.app.privateArtifactBucket,
        credentials: cfg.aws,
        monitor: monitor.childMonitor('private-bucket'),
      });
      await bucket.setupCORS();
      return bucket;
    },
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({cfg, process, monitor}) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'queue',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  // Create artifacts table
  Artifact: {
    requires: [
      'cfg', 'monitor', 'process',
      'publicArtifactBucket', 'privateArtifactBucket', 'db',
    ],
    setup: async ({cfg, monitor, process, publicArtifactBucket,
      privateArtifactBucket, db}) =>
      data.Artifact.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.artifactTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        context: {
          publicBucket: publicArtifactBucket,
          privateBucket: privateArtifactBucket,
          monitor: monitor.childMonitor('data.Artifact'),
        },
        monitor: monitor.childMonitor('table.artifacts'),
      }),
  },

  // Create task table
  Task: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.Task.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.tasks'),
      }),
  },

  // Create task-group table
  TaskGroup: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.TaskGroup.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskGroupTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.taskgroups'),
      }),
  },

  // Create task-group member table
  TaskGroupMember: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.TaskGroupMember.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskGroupMemberTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.taskgroupmembers'),
      }),
  },

  // Create task-group size table (uses TaskGroupMember entity)
  TaskGroupActiveSet: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      // NOTE: this uses the same entity type definition as TaskGroupMember,
      // but presence in either table indicates different things
      data.TaskGroupMember.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskGroupActiveSetTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.taskgroupactivesets'),
      }),
  },

  // Create TaskRequirement table
  TaskRequirement: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.TaskRequirement.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskRequirementTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.taskrequirements'),
      }),
  },

  // Create TaskDependency table
  TaskDependency: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) => {
      return data.TaskDependency.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.taskDependencyTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.taskdependencies'),
      });
    },
  },

  // Create Provisioner table
  Provisioner: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.Provisioner.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.provisionerTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.provisioner'),
      }),
  },

  // Create WorkerType table
  WorkerType: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.WorkerType.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.workerTypeTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.workerType'),
      }),
  },

  // Create Worker table
  Worker: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: async ({cfg, monitor, process, db}) =>
      data.Worker.setup({
        db,
        serviceName: 'queue',
        tableName: cfg.app.workerTableName,
        operationReportChance: cfg.app.azureReportChance,
        operationReportThreshold: cfg.app.azureReportThreshold,
        monitor: monitor.childMonitor('table.worker'),
      }),
  },

  // Create QueueService to manage azure queues
  queueService: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}) => new QueueService({
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
    requires: ['cfg', 'publisher', 'Task', 'queueService', 'monitor'],
    setup: ({cfg, publisher, Task, queueService, monitor}) => new WorkClaimer({
      publisher,
      Task,
      queueService,
      monitor: monitor.childMonitor('work-claimer'),
      claimTimeout: cfg.app.claimTimeout,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  // Create workerInfo
  workerInfo: {
    requires: ['Provisioner', 'WorkerType', 'Worker'],
    setup: ({Provisioner, WorkerType, Worker}) => new WorkerInfo({
      Provisioner, WorkerType, Worker,
    }),
  },

  // Create dependencyTracker
  dependencyTracker: {
    requires: [
      'Task', 'publisher', 'queueService', 'TaskDependency',
      'TaskRequirement', 'TaskGroupActiveSet', 'monitor',
    ],
    setup: ({monitor, ...ctx}) => new DependencyTracker({
      monitor: monitor.childMonitor('dependency-tracker'),
      ...ctx},
    ),
  },

  // Create EC2RegionResolver for regions we have artifact proxies in
  regionResolver: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let regionResolver = new EC2RegionResolver(
        cfg.app.useCloudMirror ?
          [...cfg.app.cloudMirrorRegions, cfg.aws.region] :
          [cfg.aws.region],
        monitor);
      regionResolver.start();
      return regionResolver;
    },
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('queue')],
    }).generateReferences(),
  },

  api: {
    requires: [
      'cfg', 'publisher', 'schemaset', 'Task', 'Artifact',
      'TaskGroup', 'TaskGroupMember', 'TaskGroupActiveSet', 'queueService',
      'publicArtifactBucket', 'privateArtifactBucket',
      'regionResolver', 'monitor', 'dependencyTracker', 'TaskDependency',
      'workClaimer', 'Provisioner', 'workerInfo', 'WorkerType', 'Worker',
    ],
    setup: (ctx) => builder.build({
      context: {
        Task: ctx.Task,
        Artifact: ctx.Artifact,
        TaskGroup: ctx.TaskGroup,
        TaskGroupMember: ctx.TaskGroupMember,
        TaskGroupActiveSet: ctx.TaskGroupActiveSet,
        taskGroupExpiresExtension: ctx.cfg.app.taskGroupExpiresExtension,
        TaskDependency: ctx.TaskDependency,
        Provisioner: ctx.Provisioner,
        WorkerType: ctx.WorkerType,
        Worker: ctx.Worker,
        dependencyTracker: ctx.dependencyTracker,
        publisher: ctx.publisher,
        claimTimeout: ctx.cfg.app.claimTimeout,
        queueService: ctx.queueService,
        publicBucket: ctx.publicArtifactBucket,
        privateBucket: ctx.privateArtifactBucket,
        regionResolver: ctx.regionResolver,
        credentials: ctx.cfg.taskcluster.credentials,
        useCloudMirror: !!ctx.cfg.app.useCloudMirror,
        cloudMirrorHost: ctx.cfg.app.cloudMirrorHost,
        artifactRegion: ctx.cfg.aws.region,
        monitor: ctx.monitor.childMonitor('api-context'),
        workClaimer: ctx.workClaimer,
        workerInfo: ctx.workerInfo,
        LRUcache: new QuickLRU({maxSize: ctx.cfg.app.taskCacheMaxSize || 10}),
      },
      rootUrl: ctx.cfg.taskcluster.rootUrl,
      schemaset: ctx.schemaset,
      monitor: ctx.monitor.childMonitor('api'),
    }),
  },

  // Create the server process
  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  // CLI utility to scan tasks
  scan: {
    requires: ['cfg', 'Artifact', 'Task', 'publicArtifactBucket'],
    setup: options => require('./scan')(options),
  },

  // Create the claim-resolver process
  'claim-resolver': {
    requires: [
      'cfg', 'Task', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: async ({
      cfg, Task, queueService, publisher, dependencyTracker, monitor,
    }, ownName) => {
      let resolver = new ClaimResolver({
        ownName,
        Task, queueService, publisher, dependencyTracker,
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
      'cfg', 'Task', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: async ({
      cfg, Task, queueService, publisher, dependencyTracker, monitor,
    }, ownName) => {
      let resolver = new DeadlineResolver({
        ownName,
        Task, queueService, publisher, dependencyTracker,
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
    setup: async ({cfg, queueService, dependencyTracker, monitor}, ownName) => {
      let resolver = new DependencyResolver({
        ownName,
        queueService, dependencyTracker,
        pollingDelay: cfg.app.dependencyResolver.pollingDelay,
        parallelism: cfg.app.dependencyResolver.parallelism,
        monitor: monitor.childMonitor('dependency-resolver'),
      });
      await resolver.start();
      return resolver;
    },
  },

  // Create the artifact expiration process (periodic job)
  'expire-artifacts': {
    requires: ['cfg', 'Artifact', 'monitor'],
    setup: ({cfg, Artifact, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.artifactExpirationDelay);
        debug('Expiring artifacts at: %s, from before %s', new Date(), now);
        const count = await Artifact.expire(now);
        debug('Expired %s artifacts', count);
      });
    },
  },

  // Create the queue-message expiration process (periodic job)
  'expire-queue-messages': {
    requires: ['cfg', 'queueService', 'monitor'],
    setup: ({cfg, queueService, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Expiring azqueue messages at: %s', new Date());
        await queueService.deleteExpiredMessages();
      });
    },
  },

  // Create the task expiration process (periodic job)
  'expire-tasks': {
    requires: ['cfg', 'Task', 'monitor'],
    setup: ({cfg, Task, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring tasks at: %s, from before %s', new Date(), now);
        const count = await Task.expire(now);
        debug('Expired %s tasks', count);
      });
    },
  },

  // Create the task-group expiration process (periodic job)
  'expire-task-groups': {
    requires: ['cfg', 'TaskGroup', 'monitor'],
    setup: ({cfg, TaskGroup, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-groups at: %s, from before %s', new Date(), now);
        const count = await TaskGroup.expire(now);
        debug('Expired %s task-groups', count);
      });
    },
  },

  // Create the task-group membership expiration process (periodic job)
  'expire-task-group-members': {
    requires: ['cfg', 'TaskGroupMember', 'monitor'],
    setup: ({cfg, TaskGroupMember, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-group members at: %s, from before %s',
          new Date(), now);
        const count = await TaskGroupMember.expire(now);
        debug('Expired %s task-group members', count);
      });
    },
  },

  // Create the task-group size expiration process (periodic job)
  'expire-task-group-sizes': {
    requires: ['cfg', 'TaskGroupActiveSet', 'monitor'],
    setup: ({cfg, TaskGroupActiveSet, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-group sizes at: %s, from before %s',
          new Date(), now);
        const count = await TaskGroupActiveSet.expire(now);
        debug('Expired %s task-group sizes', count);
      });
    },
  },

  // Create the task-dependency expiration process (periodic job)
  'expire-task-dependency': {
    requires: ['cfg', 'TaskDependency', 'monitor'],
    setup: ({cfg, TaskDependency, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-dependency at: %s, from before %s', new Date(), now);
        const count = await TaskDependency.expire(now);
        debug('Expired %s task-dependency', count);
      });
    },
  },

  // Create the task-requirement expiration process (periodic job)
  'expire-task-requirement': {
    requires: ['cfg', 'TaskRequirement', 'monitor'],
    setup: ({cfg, TaskRequirement, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
        debug('Expiring task-requirement at: %s, from before %s', new Date(), now);
        const count = await TaskRequirement.expire(now);
        debug('Expired %s task-requirement', count);
      });
    },
  },

  // Create the worker-info expiration process (periodic job)
  'expire-worker-info': {
    requires: ['cfg', 'workerInfo', 'monitor'],
    setup: ({cfg, workerInfo, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.workerInfoExpirationDelay);
        debug('Expiring worker-info at: %s, from before %s', new Date(), now);
        const count = await workerInfo.expire(now);
        debug('Expired %s worker-info', count);
      });
    },
  },

  // drop the provisioner / workerType / worker tracking tables (in case
  // of backouts). Intended to be run from a one-off heroku dyno
  'remove-all-worker-tables': {
    requires: ['Provisioner', 'WorkerType', 'Worker'],
    setup: async ({Provisioner, WorkerType, Worker}) => {
      await Provisioner.removeTable();
      await WorkerType.removeTable();
      await Worker.removeTable();
    },
  },

  // Create the load-test process (run as one-off job)
  'load-test': {
    requires: ['cfg'],
    setup: ({cfg}) => require('./load-test')(cfg),
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
