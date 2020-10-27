let assert = require('assert');
const debug = require('debug')('utils');

const artifactUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return exports.artifactUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      taskId: row.task_id,
      runId: row.run_id,
      name: row.name,
      storageType: row.storage_type,
      contentType: row.content_type,
      details: row.details,
      present: row.present,
      expires: row.expires,
    };
  },
  // Create a serializable representation of this namespace suitable for response
  // from an API method.
  serialize(artifact) {
    return {
      storageType: artifact.storageType,
      name: artifact.name,
      expires: artifact.expires.toJSON(),
      contentType: artifact.contentType,
    };
  },
  /**
   * Remove underlying artifact and entity representing it.
   *
   * This method will remove both the artifact in the db and underlying artifact.
   * But the artifact in the db will not be deleted if there is an error
   * deleting the underlying artifact.
   */
  async expire({ db, publicBucket, privateBucket, ignoreError, monitor, expires }) {
    let count = 0;
    const pageSize = 1000;
    let pageOffset = 0;

    //  Get all expired artifacts using a handler function.
    // This is to avoid loading all expired queue artifacts in memory.
    const getExpiredArtifacts = async (expires, handler) => {
      while (true) {
        const rows = await db.fns.get_queue_artifacts(null, null, expires, 1000, pageOffset);
        const entries = rows.map(exports.artifactUtils.fromDb);
        await Promise.all(entries.map((item) => handler.call(item, item)));
        pageOffset = pageOffset + pageSize;

        if (!rows.length) {
          break;
        }
      }
    };

    await getExpiredArtifacts(expires, async (artifact) => {
      // Promise that deleted underlying artifact, and keep reference to context
      let deleted = Promise.resolve();

      // Handle S3 artifacts
      if (artifact.storageType === 's3') {
        debug('Deleting expired s3 artifact from bucket: %s, prefix: %s',
          artifact.details.bucket, artifact.details.prefix);
        // Delete the right bucket
        if (artifact.details.bucket === publicBucket.bucket) {
          deleted = publicBucket.deleteObject(artifact.details.prefix);
        } else if (artifact.details.bucket === privateBucket.bucket) {
          deleted = privateBucket.deleteObject(artifact.details.prefix);
        } else {
          let err = new Error('Expiring artifact with bucket which isn\'t ' +
            'configured for use. Please investigate!');
          err.bucket = artifact.details.bucket;
          err.taskId = artifact.taskId;
          err.runId = artifact.runId;
          monitor.reportError(err);
          return;
        }
      }

      // When underlying artifact is deleted (if any underlying artifact exists)
      // we delete the artifact Entity.
      try {
        await deleted;

        // Delete entity, if underlying resource was successfully deleted
        await db.fns.delete_queue_artifact(artifact.taskId, artifact.runId, artifact.name);
        // to avoid having the offset skip an expired artifact when
        // we delete an artifact from the table.
        pageOffset -= 1;
        count++;
      } catch (err) {
        debug('WARNING: Failed to delete expired artifact: %j, details: %j ' +
          'from taskId: %s, runId: %s with error: %s, as JSON: %j',
        exports.artifactUtils.serialize(artifact), artifact.details, artifact.taskId, artifact.runId, err, err);
        // Rethrow error, if we're not supposed to ignore it.
        if (!ignoreError) {
          throw err;
        }
      }
    });

    return count;
  },
};

exports.artifactUtils = artifactUtils;

/**
 * Split a taskQueueId into its deprecated provisionerId/workerType components.
 */
const splitTaskQueueId = taskQueueId => {
  const split = taskQueueId.split('/');
  assert.equal(split.length, 2, `invalid taskQueueId ${taskQueueId}`);
  return { provisionerId: split[0], workerType: split[1] };
};
exports.splitTaskQueueId = splitTaskQueueId;

/**
 * Join a provisionerId and workerType to make a taskQueueId
 */
const joinTaskQueueId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};
exports.joinTaskQueueId = joinTaskQueueId;

/**
 * Add the provisionerId, workerType fields to an object that has a
 * taskQueueId field to maintain public interface compatibility
 */
const useSplitFields = (obj) => {
  assert(Object.prototype.hasOwnProperty.call(obj, 'taskQueueId'), 'object is missing property `taskQueueId`');
  const { provisionerId, workerType } = splitTaskQueueId(obj.taskQueueId);
  obj.provisionerId = provisionerId;
  obj.workerType = workerType;
  delete obj.taskQueueId;
};
exports.useSplitFields = useSplitFields;
