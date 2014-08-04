#!/usr/bin/env node
var debug       = require('debug')('queue:bin:expire-artifacts');
var base        = require('taskcluster-base');
var path        = require('path');
var Promise     = require('promise');
var _           = require('lodash');
var BlobStore   = require('../queue/blobstore');
var Bucket      = require('../queue/bucket');
var data        = require('../queue/data');
var assert      = require('assert');

/** Launch expire-artifacts */
var launch = function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'azure_accountName',
      'azure_accountKey',
      'queue_artifactExpirationDelay'
    ],
    filename:     'taskcluster-queue'
  });

  // Create artifactStore
  var artifactStore = new BlobStore({
    container:          cfg.get('queue:artifactContainer'),
    credentials:        cfg.get('azure')
  });

  // Create artifact bucket
  var artifactBucket = new Bucket({
    bucket:             cfg.get('queue:artifactBucket'),
    credentials:        cfg.get('aws')
  });

  // Create artifacts table
  var Artifact = data.Artifact.configure({
    tableName:          cfg.get('queue:artifactTableName'),
    credentials:        cfg.get('azure')
  });

  debug("Waiting for resources to be created");
  return Promise.all(
    artifactStore.createContainer(),
    Artifact.createTable()
  ).then(function() {
    // Find an artifact expiration delay
    var delay = parseInt(cfg.get('queue:artifactExpirationDelay'));
    assert(_.isNaN(delay), "Can't have NaN as artifactExpirationDelay");
    var now = new Date();
    now.setHours(now.getHours() - delay);
    // Expire artifacts using delay
    debug("Expiring artifacts at: %s, from before %s", new Date(), now);
    return Artifact.expireEntities({
      artifactBucket:   artifactBucket,
      artifactStore:    artifactStore,
      now:              now
    });
  }).then(function(count) {
    debug("Expired %s artifacts", count);

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();
  });
};

// If expire-artifacts.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: expire-artifacts.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched expire-artifacts successfully");
  }).catch(function(err) {
    debug("Failed to start expire-artifacts, err: %s, as JSON: %j",
          err, err, err.stack);
    // If we didn't launch the expire-artifacts we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;