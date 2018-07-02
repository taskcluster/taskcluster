#!/usr/bin/env node
let debug               = require('debug')('app:main');
let _                   = require('lodash');
let assert              = require('assert');
let path                = require('path');
let taskcluster         = require('taskcluster-client');
let builder             = require('./api');
let exchanges           = require('./exchanges');
let BlobStore           = require('./blobstore');
let data                = require('./data');
let Bucket              = require('./bucket');
let QueueService        = require('./queueservice');
let EC2RegionResolver   = require('./ec2regionresolver');
let DeadlineResolver    = require('./deadlineresolver');
let ClaimResolver       = require('./claimresolver');
let DependencyTracker   = require('./dependencytracker');
let DependencyResolver  = require('./dependencyresolver');
let WorkClaimer         = require('./workclaimer');
let WorkerInfo          = require('./workerinfo');
let loader              = require('taskcluster-lib-loader');
let config              = require('typed-env-config');
let monitor             = require('taskcluster-lib-monitor');
let SchemaSet           = require('taskcluster-lib-validate');
let docs                = require('taskcluster-lib-docs');
let App                 = require('taskcluster-lib-app');
let remoteS3            = require('remotely-signed-s3');
let {sasCredentials}    = require('taskcluster-lib-azure');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      projectName: 'taskcluster-queue',
      enable: cfg.monitoring.enable,
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
      mock: cfg.monitor.mock,
      process,
      // Bug 1452611 - fingerprint SSL errors
      sentryOptions: {
        dataCallback: data => {
          if (/SSL3_GET_RECORD:decryption failed or bad record mac/.test(data.message || '')) {
            data.fingerprint = ['Bug 1452611'];
          } else if (/SSL routines:ssl3_read_bytes:sslv3 alert bad record mac:/.test(data.message || '')) {
            data.fingerprint = ['Bug 1452611'];
          }
          return data;
        },
      },
    }),
  },

  // Validator and publisher
  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName:   'queue',
      publish:       cfg.app.publishMetaData,
      aws:           cfg.aws,
    }),
  },
  publisher: {
    requires: ['cfg', 'schemaset', 'monitor'],
    setup: async ({cfg, schemaset, monitor}) => exchanges.setup({
      rootUrl:            cfg.taskcluster.rootUrl,
      credentials:        cfg.pulse,
      publish:            cfg.app.publishMetaData,
      validator:          await schemaset.validator(cfg.taskcluster.rootUrl),
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'platform',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {name: 'api', reference: builder.reference()},
        {name: 'events', reference: exchanges.reference({
          rootUrl:          cfg.taskcluster.rootUrl,
          credentials:      cfg.pulse,
        })},
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  // Create artifact bucket instances
  publicArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let bucket = new Bucket({
        bucket:           cfg.app.publicArtifactBucket,
        credentials:      cfg.aws,
        bucketCDN:        cfg.app.publicArtifactBucketCDN,
        monitor:          monitor.prefix('public-bucket'),
      });
      await bucket.setupCORS();
      return bucket;
    },
  },
  privateArtifactBucket: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let bucket = new Bucket({
        bucket:           cfg.app.privateArtifactBucket,
        credentials:      cfg.aws,
        monitor:          monitor.prefix('private-bucket'),
      });
      await bucket.setupCORS();
      return bucket;
    },
  },

  // Create blobStore
  blobStore: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let store = new BlobStore({
        container:        cfg.app.artifactContainer,
        credentials:      cfg.azure,
      });
      await store.createContainer();
      await store.setupCORS();
      return store;
    },
  },

  // Create artifacts table
  Artifact: {
    requires: [
      'cfg', 'monitor', 'process',
      'blobStore', 'publicArtifactBucket', 'privateArtifactBucket',
      's3Controller',
    ],
    setup: async ({cfg, monitor, process, blobStore, publicArtifactBucket,
      privateArtifactBucket, s3Controller}) => {
      let Artifact = data.Artifact.setup({
        tableName:        cfg.app.artifactTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.artifactTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        context: {
          blobStore,
          publicBucket:   publicArtifactBucket,
          privateBucket:  privateArtifactBucket,
          monitor:        monitor.prefix('data.Artifact'),
          s3Controller:   s3Controller,
        },
        monitor:          monitor.prefix('table.artifacts'),
      });
      await Artifact.ensureTable();
      return Artifact;
    },
  },

  // Create task table
  Task: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let Task = data.Task.setup({
        tableName:        cfg.app.taskTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.tasks'),
      });
      await Task.ensureTable();
      return Task;
    },
  },

  // Create task-group table
  TaskGroup: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskGroup = data.TaskGroup.setup({
        tableName: cfg.app.taskGroupTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskGroupTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.taskgroups'),
      });
      await TaskGroup.ensureTable();
      return TaskGroup;
    },
  },

  // Create task-group member table
  TaskGroupMember: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskGroupMember = data.TaskGroupMember.setup({
        tableName:        cfg.app.taskGroupMemberTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskGroupMemberTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.taskgroupmembers'),
      });
      await TaskGroupMember.ensureTable();
      return TaskGroupMember;
    },
  },

  // Create task-group size table (uses TaskGroupMember entity)
  TaskGroupActiveSet: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      // NOTE: this uses the same entity type definition as TaskGroupMember,
      // but presence in either table indicates different things
      let TaskGroupActiveSet = data.TaskGroupMember.setup({
        tableName:        cfg.app.taskGroupActiveSetTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskGroupActiveSetTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.taskgroupactivesets'),
      });
      await TaskGroupActiveSet.ensureTable();
      return TaskGroupActiveSet;
    },
  },

  // Create TaskRequirement table
  TaskRequirement: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskRequirement = data.TaskRequirement.setup({
        tableName:        cfg.app.taskRequirementTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskRequirementTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.taskrequirements'),
      });
      await TaskRequirement.ensureTable();
      return TaskRequirement;
    },
  },

  // Create TaskDependency table
  TaskDependency: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskDependency = data.TaskDependency.setup({
        tableName:        cfg.app.taskDependencyTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.taskDependencyTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.taskdependencies'),
      });
      await TaskDependency.ensureTable();
      return TaskDependency;
    },
  },

  // Create Provisioner table
  Provisioner: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let Provisioner = data.Provisioner.setup({
        tableName:        cfg.app.provisionerTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.provisionerTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.provisioner'),
      });
      await Provisioner.ensureTable();
      return Provisioner;
    },
  },

  // Create WorkerType table
  WorkerType: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let WorkerType = data.WorkerType.setup({
        tableName:        cfg.app.workerTypeTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.workerTypeTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.workerType'),
      });
      await WorkerType.ensureTable();
      return WorkerType;
    },
  },

  // Create Worker table
  Worker: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let Worker = data.Worker.setup({
        tableName:        cfg.app.workerTableName,
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.workerTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        monitor:          monitor.prefix('table.worker'),
      });
      await Worker.ensureTable();
      return Worker;
    },
  },

  // Create QueueService to manage azure queues
  queueService: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => new QueueService({
      prefix:           cfg.app.queuePrefix,
      credentials:      cfg.azure,
      claimQueue:       cfg.app.claimQueue,
      resolvedQueue:    cfg.app.resolvedQueue,
      deadlineQueue:    cfg.app.deadlineQueue,
      deadlineDelay:    cfg.app.deadlineDelay,
      monitor:          monitor.prefix('queue-service'),
    }),
  },

  // Create workClaimer
  workClaimer: {
    requires: ['cfg', 'publisher', 'Task', 'queueService', 'monitor'],
    setup: ({cfg, publisher, Task, queueService, monitor}) => new WorkClaimer({
      publisher,
      Task,
      queueService,
      monitor:        monitor.prefix('work-claimer'),
      claimTimeout:   cfg.app.claimTimeout,
      credentials:    cfg.taskcluster.credentials,
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
      'TaskRequirement', 'TaskGroupActiveSet',
    ],
    setup: (ctx) => new DependencyTracker(ctx),
  },

  // Create EC2RegionResolver for regions we have artifact proxies in
  regionResolver: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let regionResolver = new EC2RegionResolver(
        cfg.app.useCloudMirror ? [...cfg.app.cloudMirrorRegions, cfg.aws.region] : []
      );
      await regionResolver.loadIpRanges();
      return regionResolver;
    },
  },

  s3Controller: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      return new remoteS3.Controller({
        region: cfg.app.blobArtifactRegion,
        accessKeyId: cfg.aws.accessKeyId,
        secretAccessKey: cfg.aws.secretAccessKey,
      });
    },
  },

  s3Runner: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      return new remoteS3.Runner();
    },
  },

  api: {
    requires: [
      'cfg', 'publisher', 'schemaset', 'Task', 'Artifact',
      'TaskGroup', 'TaskGroupMember', 'TaskGroupActiveSet', 'queueService',
      'blobStore', 'publicArtifactBucket', 'privateArtifactBucket',
      'regionResolver', 'monitor', 'dependencyTracker', 'TaskDependency',
      'workClaimer', 'Provisioner', 'workerInfo', 'WorkerType', 'Worker',
      's3Controller', 's3Runner',
    ],
    setup: (ctx) => builder.build({
      context: {
        Task:             ctx.Task,
        Artifact:         ctx.Artifact,
        TaskGroup:        ctx.TaskGroup,
        TaskGroupMember:  ctx.TaskGroupMember,
        TaskGroupActiveSet: ctx.TaskGroupActiveSet,
        taskGroupExpiresExtension: ctx.cfg.app.taskGroupExpiresExtension,
        TaskDependency:   ctx.TaskDependency,
        Provisioner:      ctx.Provisioner,
        WorkerType:       ctx.WorkerType,
        Worker:           ctx.Worker,
        dependencyTracker: ctx.dependencyTracker,
        publisher:        ctx.publisher,
        claimTimeout:     ctx.cfg.app.claimTimeout,
        queueService:     ctx.queueService,
        blobStore:        ctx.blobStore,
        publicBucket:     ctx.publicArtifactBucket,
        privateBucket:    ctx.privateArtifactBucket,
        regionResolver:   ctx.regionResolver,
        credentials:      ctx.cfg.taskcluster.credentials,
        cloudMirrorHost:  ctx.cfg.app.cloudMirrorHost,
        artifactRegion:   ctx.cfg.aws.region,
        monitor:          ctx.monitor.prefix('api-context'),
        workClaimer:      ctx.workClaimer,
        workerInfo:       ctx.workerInfo,
        s3Controller:     ctx.s3Controller,
        s3Runner:         ctx.s3Runner,
        blobRegion:       ctx.cfg.app.blobArtifactRegion, 
        publicBlobBucket: ctx.cfg.app.publicBlobArtifactBucket,
        privateBlobBucket:ctx.cfg.app.privateBlobArtifactBucket,
      },
      rootUrl:          ctx.cfg.taskcluster.rootUrl,
      schemaset:        ctx.schemaset,
      publish:          ctx.cfg.app.publishMetaData,
      aws:              ctx.cfg.aws,
      monitor:          ctx.monitor.prefix('api'),
    }),
  },

  // Create the server process
  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
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
    setup: ({
      cfg, Task, queueService, publisher, dependencyTracker, monitor,
    }) => {
      let resolver = new ClaimResolver({
        Task, queueService, publisher, dependencyTracker,
        pollingDelay:   cfg.app.claimResolver.pollingDelay,
        parallelism:    cfg.app.claimResolver.parallelism,
        monitor:        monitor.prefix('claim-resolver'),
      });
      resolver.start();
      return resolver;
    },
  },

  // Create the deadline reaper process
  'deadline-resolver': {
    requires: [
      'cfg', 'Task', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: ({
      cfg, Task, queueService, publisher, dependencyTracker, monitor,
    }) => {
      let resolver = new DeadlineResolver({
        Task, queueService, publisher, dependencyTracker,
        pollingDelay:   cfg.app.deadlineResolver.pollingDelay,
        parallelism:    cfg.app.deadlineResolver.parallelism,
        monitor:        monitor.prefix('deadline-resolver'),
      });
      resolver.start();
      return resolver;
    },
  },

  // Create the dependency-resolver process
  'dependency-resolver': {
    requires: ['cfg', 'queueService', 'dependencyTracker', 'monitor'],
    setup: ({cfg, queueService, dependencyTracker, monitor}) => {
      let resolver = new DependencyResolver({
        queueService, dependencyTracker,
        pollingDelay: cfg.app.dependencyResolver.pollingDelay,
        parallelism:  cfg.app.dependencyResolver.parallelism,
        monitor:      monitor.prefix('dependency-resolver'),
      });
      resolver.start();
      return resolver;
    },
  },

  // Create the artifact expiration process (periodic job)
  'expire-artifacts': {
    requires: ['cfg', 'Artifact', 'monitor'],
    setup: async ({cfg, Artifact, monitor}) => {
      // Find an artifact expiration delay
      let now = taskcluster.fromNow(cfg.app.artifactExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      debug('Expiring artifacts at: %s, from before %s', new Date(), now);
      let count = await Artifact.expire(now);
      debug('Expired %s artifacts', count);

      monitor.count('expire-artifacts.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the queue expiration process (periodic job)
  'expire-queues': {
    requires: ['cfg', 'queueService', 'monitor'],
    setup: async ({cfg, queueService, monitor}) => {
      debug('Expiring queues at: %s', new Date());
      let count = await queueService.deleteUnusedWorkerQueues();
      debug('Expired %s queues', count);

      monitor.count('expire-queues.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task expiration process (periodic job)
  'expire-tasks': {
    requires: ['cfg', 'Task', 'monitor'],
    setup: async ({cfg, Task, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire tasks using delay
      debug('Expiring tasks at: %s, from before %s', new Date(), now);
      let count = await Task.expire(now);
      debug('Expired %s tasks', count);

      monitor.count('expire-tasks.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task-group expiration process (periodic job)
  'expire-task-groups': {
    requires: ['cfg', 'TaskGroup', 'monitor'],
    setup: async ({cfg, TaskGroup, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-groups using delay
      debug('Expiring task-groups at: %s, from before %s', new Date(), now);
      let count = await TaskGroup.expire(now);
      debug('Expired %s task-groups', count);

      monitor.count('expire-task-groups.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task-group membership expiration process (periodic job)
  'expire-task-group-members': {
    requires: ['cfg', 'TaskGroupMember', 'monitor'],
    setup: async ({cfg, TaskGroupMember, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-group members using delay
      debug('Expiring task-group members at: %s, from before %s',
        new Date(), now);
      let count = await TaskGroupMember.expire(now);
      debug('Expired %s task-group members', count);

      monitor.count('expire-task-group-members.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task-group size expiration process (periodic job)
  'expire-task-group-sizes': {
    requires: ['cfg', 'TaskGroupActiveSet', 'monitor'],
    setup: async ({cfg, TaskGroupActiveSet, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-group sizes using delay
      debug('Expiring task-group sizes at: %s, from before %s',
        new Date(), now);
      let count = await TaskGroupActiveSet.expire(now);
      debug('Expired %s task-group sizes', count);

      monitor.count('expire-task-group-sizes.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task-dependency expiration process (periodic job)
  'expire-task-dependency': {
    requires: ['cfg', 'TaskDependency', 'monitor'],
    setup: async ({cfg, TaskDependency, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-dependency using delay
      debug('Expiring task-dependency at: %s, from before %s', new Date(), now);
      let count = await TaskDependency.expire(now);
      debug('Expired %s task-dependency', count);

      monitor.count('expire-task-dependency.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the task-requirement expiration process (periodic job)
  'expire-task-requirement': {
    requires: ['cfg', 'TaskRequirement', 'monitor'],
    setup: async ({cfg, TaskRequirement, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-requirement using delay
      debug('Expiring task-requirement at: %s, from before %s', new Date(), now);
      let count = await TaskRequirement.expire(now);
      debug('Expired %s task-requirement', count);

      monitor.count('expire-task-requirement.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  // Create the worker-info expiration process (periodic job)
  'expire-worker-info': {
    requires: ['cfg', 'workerInfo', 'monitor'],
    setup: async ({cfg, workerInfo, monitor}) => {
      const now = taskcluster.fromNow(cfg.app.workerInfoExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire worker-info using delay
      debug('Expiring worker-info at: %s, from before %s', new Date(), now);
      const count = await workerInfo.expire(now);
      debug('Expired %s worker-info', count);

      monitor.count('expire-worker-info.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
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

}, ['profile', 'process']);

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
