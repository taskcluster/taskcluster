var base    = require('taskcluster-base');
var debug   = require('debug')('queue:data');
var assert  = require('assert');
var Promise = require('promise');

/** Entity for tracking tasks and associated state */
var Task = base.Entity.configure({
  version:          1,
  partitionKey      base.Entity.keys.StringKey('taskId'),
  rowKey:           base.Entity.keys.ConstantKey('task')
  properties: {
    taskId:         base.Entity.types.SlugId,
    provisionerId:  base.Entity.types.String,
    workerType:     base.Entity.types.String,
    schedulerId:    base.Entity.types.String,
    taskGroupId:    base.Entity.types.SlugId,
    /** List of custom routes as strings */
    routes:         base.Entity.types.JSON,
    retries:        base.Entity.types.Number,
    retriesLeft:    base.Entity.types.Number,
    created:        base.Entity.types.Date,
    deadline:       base.Entity.types.Date,
    expires:        base.Entity.types.Date,
    /** List of scopes as strings */
    scopes:         base.Entity.types.JSON,
    payload:        base.Entity.types.JSON,
    /**
     * Meta-data object with properties:
     * - name
     * - description
     * - owner
     * - source
     * See JSON schema for documentation.
     */
    metadata:       base.Entity.types.JSON,
    /** Tags as mapping from tag-key to tag-value as string */
    tags:           base.Entity.types.JSON,
    extra:          base.Entity.types.JSON,
    /**
     * List of run objects with the following keys:
     * - runId
     * - state
     * - reasonCreated
     * - reasonResolved
     * - workerGroup
     * - workerId
     * - takenUntil
     * - scheduled
     * - started
     * - resolved
     * See schema for task status structure for details.
     * Remark that `runId` always match the index in the array.
     */
    runs:           base.Entity.types.JSON
  }
});


// Export Task
exports.Task = Task;

/** Entity for tracking artifacts */
var Artifact = base.Entity.configure({
  version:          1,
  partitionKey      base.Entity.keys.CompositeKey('taskId', 'runId'),
  rowKey:           base.Entity.keys.StringKey('name')
  properties: {
    taskId:         base.Entity.types.SlugId,
    runId:          base.Entity.types.Number,
    name:           base.Entity.types.String,
    storageType:    base.Entity.types.String,
    contentType:    base.Entity.types.String,
    /**
     * Location details storageType,
     *
     * storageType: s3
     *   bucket:        S3 bucket that contains the object
     *   prefix:        Prefix (path) for the object within the bucket
     *
     * storageType: azure
     *   container:     Azure container that holds the blob
     *   path:          Path to blob within container
     *
     * storageType: reference
     *   url:           URL that artifact should redirect to
     *
     * storageType: error
     *   reason:        Formalized reason for error artifact, see JSON schema.
     *   message:       Human readable error message to return
     */
    details:        base.Entity.types.JSON,
    expires:        base.Entity.types.Date
  },
  context: [
    'blobStore',              // BlobStore instance wrapper Azure Blob Storage
    's3',                     // S3 client with credentials
    'privateArtifactBucket',  // Private artifact bucket name
    'publicArtifactBucket'    // Public artifact bucket name
  ]
});

/** Return JSON representation of artifact meta-data */
Artifact.prototype.json = function() {
  return {
    storageType:      this.storageType,
    name:             this.name,
    expires:          this.expires.toJSON(),
    contentType:      this.contentType
  };
};

/**
 * Remove underlying artifact and entity representing it.
 *
 * Warning, unlike Entity.remove which this method overwrites, this method will
 * remove both entity and underlying artifact regardless of any changes. But
 * the Entity will not be deleted if there is an error deleting the underlying
 * artifact.
 */
Artifact.prototype.remove = function(ignoreError) {
  // Promise that deleted underlying artifact, and keep reference to context
  var deleted = Promise.resolve();
  var ctx     = this;

  // Handle S3 artifacts
  if (this.storageType === 's3') {
    // Validate that we can delete this object
    if (this.details.bucket !== this.publicArtifactBucket &&
        this.details.bucket !== this.privateArtifactBucket) {
      debug("[alert-operator] Expiring artifact with bucket: %s, which isn't " +
            "configured for use. Please investigate taskId: %s, runId: %s",
            this.details.bucket, this.taskId, this.runId);
      return;
    }
    // Delete object
    debug("Deleting expired s3 artifact from bucket: %s, prefix: %s",
          this.details.bucket, this.details.prefix);
    deleted = this.s3.deleteObject({
      Bucket:       this.details.bucket,
      Key:          this.details.prefix
    }).promise();
  }

  // Handle azure artifact
  if (this.storageType === 'azure') {
    // Validate that this is the configured container
    if (this.details.container !== this.blobStore.container) {
      debug("[alert-operator] Expiring artifact with container: %s, which " +
            "configured for use. Please investigate taskId: %s, runId: %s",
            this.details.container, this.taskId, this.runId);
      return;
    }
    debug("Deleting expired azure artifact from container: %s, path: %s",
          container, path);
    deleted = this.blobStore.deleteBlob(this.path, true);
  }

  // When underlying artifact is deleted (if any underlying artifact exists)
  // we delete the artifact Entity.
  return deleted.then(function() {
    // Delete entity, if underlying resource was successfully deleted
    return base.Entity.prototype.remove.call(ctx, true, true);
  }, function(err) {
    debug("WARNING: Failed to delete expired artifact: %j, details: %j " +
          "from taskId: %s, runId: %s with error: %s, as JSON: %j",
          ctx.json(), ctx.details, ctx.taskId, ctx.runId, err, err);
    // Rethrow error, if we're not supposed to ignore it.
    if (!ignoreError) {
      throw err;
    }
  });
};


/**
 * Expire artifacts that are past their expiration.
 *
 * Returns a promise that all expired artifacts have been deleted
 */
Artifact.expireArtifacts = function(now) {
  assert(now instanceof Date, "now must be given as option");
  return base.Entity.scan.call(this, {
    expires:          base.Entity.op.lessThan(now)
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          function(item) { return item.remove(true); }
  });
};

// Export Artifact
exports.Artifact = Artifact;

