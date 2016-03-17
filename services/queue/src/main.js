#!/usr/bin/env node
let debug               = require('debug')('queue:main');
let base                = require('taskcluster-base');
let v1                  = require('../routes/v1');
let path                = require('path');
let Promise             = require('promise');
let exchanges           = require('../queue/exchanges');
let _                   = require('lodash');
let assert              = require('assert');
let taskcluster         = require('taskcluster-client');
let BlobStore           = require('../queue/blobstore');
let data                = require('../queue/data');
let Bucket              = require('../queue/bucket');
let QueueService        = require('../queue/queueservice');
let raven               = require('raven');
let EC2RegionResolver   = require('../queue/ec2regionresolver');
let DeadlineResolver    = require('../queue/deadlineresolver');
let ClaimResolver       = require('../queue/claimresolver');
let DependencyTracker   = require('../queue/dependencytracker');
let DependencyResolver  = require('../queue/dependencyresolver')

// Create component loader
let load = base.loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  influx: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.influx.connectionString) {
        return new base.stats.Influx(cfg.influx);
      }
      return new base.stats.NullDrain();
    }
  },
  raven: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.raven.sentryDSN) {
        return new raven.Client(cfg.raven.sentryDSN);
      }
      return null;
    }
  },
  monitor: {
    requires: ['cfg', 'influx', 'process'],
    setup: ({cfg, influx, process}) => base.stats.startProcessUsageReporting({
      drain:      influx,
      component:  cfg.app.statsComponent,
      process:    process
    })
  },

  // Validator and publisher
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      folder:        path.join(__dirname, '..', 'schemas'),
      constants:     require('../schemas/constants'),
      publish:       cfg.app.publishMetaData,
      schemaPrefix:  'queue/v1/',
      aws:           cfg.aws
    })
  },
  publisher: {
    requires: ['cfg', 'validator', 'influx', 'process'],
    setup: ({cfg, validator, influx, process}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'queue/v1/exchanges.json',
      publish:            cfg.app.publishMetaData,
      aws:                cfg.aws,
      drain:              influx,
      component:          cfg.app.statsComponent,
      process:            process
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
      'cfg', 'influx', 'process',
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
        drain:            ctx.influx,
        component:        ctx.cfg.app.statsComponent,
        process:          ctx.process
      });
      await Artifact.ensureTable();
      return Artifact;
    }
  },

  // Create task table
  Task: {
    requires: ['cfg', 'influx', 'process'],
    setup: async ({cfg, influx, process}) => {
      let Task = data.Task.setup({
        table:            cfg.app.taskTableName,
        credentials:      cfg.azure,
        drain:            influx,
        component:        cfg.app.statsComponent,
        process:          process
      });
      await Task.ensureTable();
      return Task;
    }
  },

  // Create task-group table
  TaskGroup: {
    requires: ['cfg', 'influx', 'process'],
    setup: async ({cfg, influx, process}) => {
      let TaskGroup = data.TaskGroup.setup({
        table:            cfg.app.taskGroupTableName,
        credentials:      cfg.azure,
        drain:            influx,
        component:        cfg.app.statsComponent,
        process:          process
      });
      await TaskGroup.ensureTable();
      return TaskGroup;
    }
  },

  // Create task-group member table
  TaskGroupMember: {
    requires: ['cfg', 'influx', 'process'],
    setup: async ({cfg, influx, process}) => {
      let TaskGroupMember = data.TaskGroupMember.setup({
        table:            cfg.app.taskGroupMemberTableName,
        credentials:      cfg.azure,
        drain:            influx,
        component:        cfg.app.statsComponent,
        process:          process
      });
      await TaskGroupMember.ensureTable();
      return TaskGroupMember;
    }
  },

  // Create TaskRequirement table
  TaskRequirement: {
    requires: ['cfg', 'influx', 'process'],
    setup: async ({cfg, influx, process}) => {
      let TaskRequirement = data.TaskRequirement.setup({
        table:            cfg.app.taskRequirementTableName,
        credentials:      cfg.azure,
        drain:            influx,
        component:        cfg.app.statsComponent,
        process:          process
      });
      await TaskRequirement.ensureTable();
      return TaskRequirement;
    }
  },

  // Create TaskDependency table
  TaskDependency: {
    requires: ['cfg', 'influx', 'process'],
    setup: async ({cfg, influx, process}) => {
      let TaskDependency = data.TaskDependency.setup({
        table:            cfg.app.taskDependencyTableName,
        credentials:      cfg.azure,
        drain:            influx,
        component:        cfg.app.statsComponent,
        process:          process
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
      'regionResolver', 'raven', 'influx', 'dependencyTracker'
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
      },
      validator:        ctx.validator,
      raven:            ctx.raven,
      authBaseUrl:      ctx.cfg.taskcluster.authBaseUrl,
      publish:          ctx.cfg.app.publishMetaData,
      baseUrl:          ctx.cfg.server.publicUrl + '/v1',
      referencePrefix:  'queue/v1/api.json',
      aws:              ctx.cfg.aws,
      component:        ctx.cfg.app.statsComponent,
      drain:            ctx.influx
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
    requires: ['cfg', 'Artifact', 'monitor', 'influx'],
    setup: async ({cfg, Artifact, influx}) => {
      // Find an artifact expiration delay
      let now = taskcluster.fromNow(cfg.app.artifactExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      debug("Expiring artifacts at: %s, from before %s", new Date(), now);
      let count = await Artifact.expire(now);
      debug("Expired %s artifacts", count);

      // Stop recording statistics and send any stats that we have
      base.stats.stopProcessUsageReporting();
      return influx.close();
    }
  },

  // Create the queue expiration process (periodic job)
  'expire-queues': {
    requires: ['cfg', 'queueService', 'monitor', 'influx'],
    setup: async ({cfg, queueService, influx}) => {
      debug("Expiring queues at: %s", new Date());
      let count = await queueService.deleteUnusedWorkerQueues();
      debug("Expired %s queues", count);

      // Stop recording statistics and send any stats that we have
      base.stats.stopProcessUsageReporting();
      return influx.close();
    }
  },

  // Create the task expiration process (periodic job)
  'expire-tasks': {
    requires: ['cfg', 'Task', 'monitor', 'influx'],
    setup: async ({cfg, Task, influx}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire tasks using delay
      debug("Expiring tasks at: %s, from before %s", new Date(), now);
      let count = await Task.expire(now);
      debug("Expired %s tasks", count);

      // Stop recording statistics and send any stats that we have
      base.stats.stopProcessUsageReporting();
      return influx.close();
    }
  },

  // Create the task-group expiration process (periodic job)
  'expire-task-groups': {
    requires: ['cfg', 'TaskGroup', 'monitor', 'influx'],
    setup: async ({cfg, TaskGroup, influx}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-groups using delay
      debug("Expiring task-groups at: %s, from before %s", new Date(), now);
      let count = await TaskGroup.expire(now);
      debug("Expired %s task-groups", count);

      // Stop recording statistics and send any stats that we have
      base.stats.stopProcessUsageReporting();
      return influx.close();
    }
  },

  // Create the task-group membership expiration process (periodic job)
  'expire-task-group-members': {
    requires: ['cfg', 'TaskGroupMember', 'monitor', 'influx'],
    setup: async ({cfg, TaskGroupMember, influx}) => {
      var now = taskcluster.fromNow(cfg.app.taskExpirationDelay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      // Expire task-group members using delay
      debug("Expiring task-group members at: %s, from before %s",
            new Date(), now);
      let count = await TaskGroupMember.expire(now);
      debug("Expired %s task-group members", count);

      // Stop recording statistics and send any stats that we have
      base.stats.stopProcessUsageReporting();
      return influx.close();
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
