#!/usr/bin/env node
var debug             = require('debug')('queue:bin:server');
var base              = require('taskcluster-base');
var v1                = require('../routes/v1');
var path              = require('path');
var Promise           = require('promise');
var exchanges         = require('../queue/exchanges');
var _                 = require('lodash');
var BlobStore         = require('../queue/blobstore');
var data              = require('../queue/data');
var Bucket            = require('../queue/bucket');
var QueueService      = require('../queue/queueservice');
var EC2RegionResolver = require('../queue/ec2regionresolver');

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'queue_publishMetaData',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'azure_accountName',
      'azure_accountKey',
      'influx_connectionString',
      'queue_usePublicArtifactBucketProxy'
    ],
    filename:     'taskcluster-queue'
  });

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx({
    connectionString:   cfg.get('influx:connectionString'),
    maxDelay:           cfg.get('influx:maxDelay'),
    maxPendingPoints:   cfg.get('influx:maxPendingPoints')
  });

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      influx,
    component:  cfg.get('queue:statsComponent'),
    process:    'server'
  });

  // Create artifact bucket instances
  var publicArtifactBucket = new Bucket({
    bucket:             cfg.get('queue:publicArtifactBucket'),
    credentials:        cfg.get('aws')
  });
  var privateArtifactBucket = new Bucket({
    bucket:             cfg.get('queue:privateArtifactBucket'),
    credentials:        cfg.get('aws')
  });

  // Create artifactStore
  var artifactStore = new BlobStore({
    container:          cfg.get('queue:artifactContainer'),
    credentials:        cfg.get('azure')
  });

  // Create artifacts table
  var Artifact = data.Artifact.setup({
    table:              cfg.get('queue:artifactTableName'),
    credentials:        cfg.get('azure'),
    context: {
      blobStore:        artifactStore,
      publicBucket:     publicArtifactBucket,
      privateBucket:    privateArtifactBucket
    },
    drain:              influx,
    component:          cfg.get('queue:statsComponent'),
    process:            'server'
  });

  // Create task table
  var Task = data.Task.setup({
    table:              cfg.get('queue:taskTableName'),
    credentials:        cfg.get('azure'),
    drain:              influx,
    component:          cfg.get('queue:statsComponent'),
    process:            'server'
  });

  // Create QueueService to manage azure queues
  var queueService = new QueueService({
    prefix:           cfg.get('queue:queuePrefix'),
    credentials:      cfg.get('azure'),
    claimQueue:       cfg.get('queue:claimQueue'),
    deadlineQueue:    cfg.get('queue:deadlineQueue'),
    deadlineDelay:    cfg.get('queue:deadlineDelay')
  });

  // Create EC2RegionResolver for regions we have artifact proxies in
  var regionResolver = new EC2RegionResolver(
    cfg.get('queue:usePublicArtifactBucketProxy') === 'true' ?
      _.keys(cfg.get('queue:publicArtifactBucketProxies'))
    :
      []
  );

  // When: publisher, validator and containers are created, proceed
  debug("Waiting for resources to be created");
  var validator, publisher;
  await Promise.all([
    (async () => {
      validator = await base.validator({
        folder:           path.join(__dirname, '..', 'schemas'),
        constants:        require('../schemas/constants'),
        publish:          cfg.get('queue:publishMetaData') === 'true',
        schemaPrefix:     'queue/v1/',
        aws:              cfg.get('aws')
      });

      publisher = await exchanges.setup({
        credentials:        cfg.get('pulse'),
        exchangePrefix:     cfg.get('queue:exchangePrefix'),
        validator:          validator,
        referencePrefix:    'queue/v1/exchanges.json',
        publish:            cfg.get('queue:publishMetaData') === 'true',
        aws:                cfg.get('aws'),
        drain:              influx,
        component:          cfg.get('queue:statsComponent'),
        process:            'server'
      });
    })(),
    (async () => {
      await artifactStore.createContainer();
      await artifactStore.setupCORS();
    })(),
    Task.ensureTable(),
    Artifact.ensureTable(),
    publicArtifactBucket.setupCORS(),
    privateArtifactBucket.setupCORS(),
    regionResolver.loadIpRanges()
  ]);

  // Create API router and publish reference if needed
  debug("Creating API router");

  var router = await v1.setup({
    context: {
      Task:           Task,
      Artifact:       Artifact,
      publisher:      publisher,
      validator:      validator,
      claimTimeout:   cfg.get('queue:claimTimeout'),
      queueService:   queueService,
      blobStore:      artifactStore,
      publicBucket:   publicArtifactBucket,
      privateBucket:  privateArtifactBucket,
      regionResolver: regionResolver,
      publicProxies:  cfg.get('queue:publicArtifactBucketProxies')
    },
    validator:        validator,
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
    publish:          cfg.get('queue:publishMetaData') === 'true',
    baseUrl:          cfg.get('server:publicUrl') + '/v1',
    referencePrefix:  'queue/v1/api.json',
    aws:              cfg.get('aws'),
    component:        cfg.get('queue:statsComponent'),
    drain:            influx
  });

  debug("Configuring app");

  // Create app
  var app = base.app({
    port:           Number(process.env.PORT || cfg.get('server:port')),
    env:            cfg.get('server:env'),
    forceSSL:       cfg.get('server:forceSSL'),
    trustProxy:     cfg.get('server:trustProxy')
  });

  // Mount API router
  app.use('/v1', router);

  // Create server
  debug("Launching server");
  return app.createServer();
};

// If server.js is executed start the server
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: server.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;