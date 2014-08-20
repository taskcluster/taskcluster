var base    = require('taskcluster-base');
var debug   = require('debug')('queue:data');
var assert  = require('assert');
var Promise = require('promise');

/** Azure table storage item for tracking an artifact */
var Artifact = base.Entity.configure({
  mapping: [
    {
      key:      'PartitionKey',
      property: 'taskIdSlashRunId',
      type:     'encodedstring'
    }, {
      key:      'RowKey',
      property: 'name',
      type:     'encodedstring'
    }, {
      key:      'version',
      type:     'number'
    }, {
      key:      'storageType',
      type:     'string'
    }, {
      key:      'contentType',
      type:     'string'
    }, {
      key:      'details',
      type:     'json'
    }, {
      key:      'expires',
      type:     'date'
    }
  ]
});

/** Define auxiliary property to read `taskId` from `taskIdSlashRunId` */
Object.defineProperty(Artifact.prototype, 'taskId', {
  enumerable: true,
  get: function() { return this.taskIdSlashRunId.split('/')[0]; }
});

/** Define auxiliary property to read `runId` from `taskIdSlashRunId` */
Object.defineProperty(Artifact.prototype, 'runId', {
  enumerable: true,
  get: function() { return parseInt(this.taskIdSlashRunId.split('/')[1]); }
});

/** Overwrite create to construct taskIdSlashRunId */
Artifact.create = function(properties) {
  assert(properties.taskId  !== undefined, "can't create without taskId");
  assert(properties.runId   !== undefined, "can't create without runId");
  properties.taskIdSlashRunId = properties.taskId + '/' + properties.runId;
  delete properties.taskId;
  delete properties.runId;
  return base.Entity.create.call(this, properties);
};

/** Overwrite load to construct taskIdSlashRunId */
Artifact.load = function(taskId, runId, name) {
  return base.Entity.load.call(this, taskId + '/' + runId, name);
};

/** List all artifacts  for a given `taskId` and `runId` */
Artifact.list = function(taskId, runId) {
  return base.Entity.queryPartitionKey.call(this, taskId + '/' + runId);
};

/**
 * Expire artifacts that are past their expiration.
 *
 * options:
 * {
 *   artifactBucket:     // Bucket for S3 artifact storage
 *   artifactStore:      // BlobStore for Azure blob artifact storage
 *   now:                // Date object to expire from
 * }
 *
 * Returns a promise that all expired artifacts have been deleted
 */
Artifact.expireEntities = function(options) {
  assert(options.now instanceof Date, "now must be given as option");
  var count = 0;
  return base.Entity.queryProperty.call(this,
    'expires', '<=', options.now,
    function(artifact) {
      // Promise that we're ready to delete the artifact
      var ready = Promise.resolve(null);

      // Handle S3 artifacts
      if (artifact.storageType === 's3') {
        debug("Deleting artifact from S3 at: %s", artifact.details.prefix);
        ready = options.artifactBucket.deleteObject(artifact.details.prefix);
      }

      // Handle azure artifacts
      if (artifact.storageType === 'azure') {
        ready = options.artifactStore.deleteBlob(artifact.details.path, true);
      }

      // When resources are deleted, we delete the reference from table storage
      return ready.then(function() {
        debug("Removing artifact: %s for %s", artifact.name, artifact.taskId);
        return artifact.remove().then(function() {
          count += 1;
        });
      });
  }).then(function() {
    return count;
  });
};

/** Return JSON representation of artifact meta-data */
Artifact.prototype.json = function() {
  return {
    storageType:      this.storageType,
    name:             this.name,
    expires:          this.expires.toJSON(),
    contentType:      this.contentType
  };
};

// Export Artifact
exports.Artifact = Artifact;
