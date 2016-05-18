#!/usr/bin/env node
let debug               = require('debug')('app:main');
let base                = require('taskcluster-base');
let _                   = require('lodash');
let assert              = require('assert');
let path                = require('path');
let Promise             = require('promise');
let taskcluster         = require('taskcluster-client');
let v1                  = require('./api');
let exchanges           = require('./exchanges');
let BlobStore           = require('./blobstore');
let data                = require('./data');
let Bucket              = require('./bucket');
let QueueService        = require('./queueservice');
let EC2RegionResolver   = require('./ec2regionresolver');
let DeadlineResolver    = require('./deadlineresolver');
let ClaimResolver       = require('./claimresolver');
let DependencyTracker   = require('./dependencytracker');
let DependencyResolver  = require('./dependencyresolver')

// Create component loader
let load = base.loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => base.monitor({
      project: 'taskcluster-queue',
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    })
  },

  // Validator and publisher
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      prefix:       'queue/v1/',
      aws:           cfg.aws
    })
  },
  publisher: {
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'queue/v1/exchanges.json',
      publish:            cfg.app.publishMetaData,
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    })
  },

  // Create artifact bucket instances
  publicArtifactBucket: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let bucket = new Bucket({
        bucket:           cfg.app.publicArtifactBucket,
        credentials:      cfg.aws,
        bucketCDN:        cfg.app.publicArtifactBucketCDN,
      });
      await bucket.setupCORS();
      return bucket;
    }
  },
  privateArtifactBucket: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let bucket = new Bucket({
        bucket:           cfg.app.privateArtifactBucket,
        credentials:      cfg.aws
      });
      await bucket.setupCORS();
      return bucket;
    }
  },

  // Create artifactStore
  artifactStore: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let store = new BlobStore({
        container:        cfg.app.artifactContainer,
        credentials:      cfg.azure
      });
      await store.createContainer();
      await store.setupCORS();
      return store;
    }
  },

  // Create artifacts table
  Artifact: {
    requires: [
      'cfg', 'monitor', 'process',
      'artifactStore', 'publicArtifactBucket', 'privateArtifactBucket',
    ],
    setup: async (ctx) => {
      let Artifact = data.Artifact.setup({
        table:            ctx.cfg.app.artifactTableName,
        credentials:      ctx.cfg.azure,
        context: {
          blobStore:      ctx.artifactStore,
          publicBucket:   ctx.publicArtifactBucket,
          privateBucket:  ctx.privateArtifactBucket
        },
        monitor: ctx.monitor.prefix('table.artifacts'),
      });
      await Artifact.ensureTable();
      return Artifact;
    }
  },

  // Create task table
  Task: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let Task = data.Task.setup({
        table:            cfg.app.taskTableName,
        credentials:      cfg.azure,
        monitor: monitor.prefix('table.tasks'),
      });
      await Task.ensureTable();
      return Task;
    }
  },

  // Create task-group table
  TaskGroup: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskGroup = data.TaskGroup.setup({
        table:            cfg.app.taskGroupTableName,
        credentials:      cfg.azure,
        monitor: monitor.prefix('table.taskgroups'),
      });
      await TaskGroup.ensureTable();
      return TaskGroup;
    }
  },

  // Create task-group member table
  TaskGroupMember: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskGroupMember = data.TaskGroupMember.setup({
        table:            cfg.app.taskGroupMemberTableName,
        credentials:      cfg.azure,
        monitor: monitor.prefix('tabel.taskgroupmembers'),
      });
      await TaskGroupMember.ensureTable();
      return TaskGroupMember;
    }
  },

  // Create TaskRequirement table
  TaskRequirement: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskRequirement = data.TaskRequirement.setup({
        table:            cfg.app.taskRequirementTableName,
        credentials:      cfg.azure,
        monitor: monitor.prefix('table.taskrequirements'),
      });
      await TaskRequirement.ensureTable();
      return TaskRequirement;
    }
  },

  // Create TaskDependency table
  TaskDependency: {
    requires: ['cfg', 'monitor', 'process'],
    setup: async ({cfg, monitor, process}) => {
      let TaskDependency = data.TaskDependency.setup({
        table:            cfg.app.taskDependencyTableName,
        credentials:      cfg.azure,
        monitor: monitor.prefix('table.taskdependencies'),
      });
      await TaskDependency.ensureTable();
      return TaskDependency;
    }
  },

  // Create QueueService to manage azure queues
  queueService: {
    requires: ['cfg'],
    setup: ({cfg}) => new QueueService({
      prefix:           cfg.app.queuePrefix,
      credentials:      cfg.azure,
      claimQueue:       cfg.app.claimQueue,
      resolvedQueue:    cfg.app.resolvedQueue,
      deadlineQueue:    cfg.app.deadlineQueue,
      deadlineDelay:    cfg.app.deadlineDelay
    })
  },

  // Create dependencyTracker
  dependencyTracker: {
    requires: [
      'Task', 'publisher', 'queueService', 'TaskDependency', 'TaskRequirement',
    ],
    setup: (ctx) => new DependencyTracker(ctx),
  },

  // Create EC2RegionResolver for regions we have artifact proxies in
  regionResolver: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let regionResolver = new EC2RegionResolver(
        cfg.app.usePublicArtifactBucketProxy ?
        _.keys(cfg.app.publicArtifactBucketProxies) : []
      );
      await regionResolver.loadIpRanges();
      return regionResolver;
    }
  },

  api: {
    requires: [
      'cfg', 'publisher', 'validator',
      'Task', 'Artifact', 'TaskGroup', 'TaskGroupMember', 'queueService',
      'artifactStore', 'publicArtifactBucket', 'privateArtifactBucket',
      'regionResolver', 'monitor', 'dependencyTracker'
    ],
    setup: (ctx) => v1.setup({
      context: {
        Task:             ctx.Task,
        Artifact:         ctx.Artifact,
        TaskGroup:        ctx.TaskGroup,
        TaskGroupMember:  ctx.TaskGroupMember,
        taskGroupExpiresExtension: ctx.cfg.app.taskGroupExpiresExtension,
        dependencyTracker: ctx.dependencyTracker,
        publisher:        ctx.publisher,
        validator:        ctx.validator,
        claimTimeout:     ctx.cfg.app.claimTimeout,
        queueService:     ctx.queueService,
        blobStore:        ctx.artifactStore,
        publicBucket:     ctx.publicArtifactBucket,
        privateBucket:    ctx.privateArtifactBucket,
        regionResolver:   ctx.regionResolver,
        publicProxies:    ctx.cfg.app.publicArtifactBucketProxies,
        credentials:      ctx.cfg.taskcluster.credentials,
        cloudMirrorHost:  ctx.cfg.app.cloudMirrorHost,
        artifactRegion:   ctx.cfg.aws.region,
      },
      validator:        ctx.validator,
      authBaseUrl:      ctx.cfg.taskcluster.authBaseUrl,
      publish:          ctx.cfg.app.publishMetaData,
      baseUrl:          ctx.cfg.server.publicUrl + '/v1',
      referencePrefix:  'queue/v1/api.json',
      aws:              ctx.cfg.aws,
      monitor:          ctx.monitor.prefix('api'),
    })
  },

  // Create the server process
  server: {
    requires: ['cfg', 'api', 'monitor'],
    setup: ({cfg, api}) => {
      let app = base.app(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    }
  },

  // Create the claim-reaper process
  'claim-reaper': {
    requires: [
      'cfg', 'Task', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: ({cfg, Task, queueService, publisher, dependencyTracker}) => {
      let resolver = new ClaimResolver({
        Task, queueService, publisher, dependencyTracker,
        pollingDelay:   cfg.app.claim.pollingDelay,
        parallelism:    cfg.app.claim.parallelism
      });
      resolver.start();
      return resolver;
    }
  },

  // Create the deadline reaper process
  'deadline-reaper': {
    requires: [
      'cfg', 'Task', 'queueService', 'publisher', 'monitor',
      'dependencyTracker',
    ],
    setup: ({cfg, Task, queueService, publisher, dependencyTracker}) => {
      let resolver = new DeadlineResolver({
        Task, queueService, publisher, dependencyTracker,
        pollingDelay:   cfg.app.deadline.pollingDelay,
        parallelism:    cfg.app.deadline.parallelism
      });
      resolver.start();
      return resolver;
    }
  },

  // Create the dependency-resolver process
  'dependency-resolver': {
    requires: ['cfg', 'queueService', 'dependencyTracker'],
    setup: ({cfg, queueService, dependencyTracker}) => {
      let resolver = new DependencyResolver({
        queueService, dependencyTracker,
        pollingDelay:   cfg.app.dependencyResolver.pollingDelay,
        parallelism:    cfg.app.dependencyResolver.parallelism
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
      assert(!_.isNaN(now), "Can't have NaN as now");

      debug("Expiring artifacts at: %s, from before %s", new Date(), now);
      let count = await Artifact.expire(now);
      debug("Expired %s artifacts", count);

      monitor.count("expire-artifacts.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the queue expiration process (periodic job)
  'expire-queues': {
    requires: ['cfg', 'queueService', 'monitor'],
    setup: async ({cfg, queueService, monitor}) => {
      debug("Expiring queues at: %s", new Date());
      let count = await queueService.deleteUnusedWorkerQueues();
      debug("Expired %s queues", count);

      monitor.count("expire-queues.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the task expiration process (periodic job)
  'expire-tasks': {
    requires: ['cfg', 'Task', 'monitor'],
    setup: async ({cfg, Task, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire tasks using delay
      debug("Expiring tasks at: %s, from before %s", new Date(), now);
      let count = await Task.expire(now);
      debug("Expired %s tasks", count);

      monitor.count("expire-tasks.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the task-group expiration process (periodic job)
  'expire-task-groups': {
    requires: ['cfg', 'TaskGroup', 'monitor'],
    setup: async ({cfg, TaskGroup, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-groups using delay
      debug("Expiring task-groups at: %s, from before %s", new Date(), now);
      let count = await TaskGroup.expire(now);
      debug("Expired %s task-groups", count);

      monitor.count("expire-task-groups.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the task-group membership expiration process (periodic job)
  'expire-task-group-members': {
    requires: ['cfg', 'TaskGroupMember', 'monitor'],
    setup: async ({cfg, TaskGroupMember, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-group members using delay
      debug("Expiring task-group members at: %s, from before %s",
            new Date(), now);
      let count = await TaskGroupMember.expire(now);
      debug("Expired %s task-group members", count);

      monitor.count("expire-task-group-members.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the task-dependency expiration process (periodic job)
  'expire-task-dependency': {
    requires: ['cfg', 'TaskDependency', 'monitor'],
    setup: async ({cfg, TaskDependency, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-dependency using delay
      debug("Expiring task-dependency at: %s, from before %s", new Date(), now);
      let count = await TaskDependency.expire(now);
      debug("Expired %s task-dependency", count);

      monitor.count("expire-task-dependency.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

   // Create the task-requirement expiration process (periodic job)
  'expire-task-requirement': {
    requires: ['cfg', 'TaskRequirement', 'monitor'],
    setup: async ({cfg, TaskRequirement, monitor}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-requirement using delay
      debug("Expiring task-requirement at: %s, from before %s", new Date(), now);
      let count = await TaskRequirement.expire(now);
      debug("Expired %s task-requirement", count);

      monitor.count("expire-task-requirement.done");
      monitor.stopResourceMonitoring();
      await monitor.flush();
    }
  },

  // Create the load-test process (run as one-off job)
  'load-test': {
    requires: ['cfg'],
    setup: ({cfg}) => require('./load-test')(cfg)
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
