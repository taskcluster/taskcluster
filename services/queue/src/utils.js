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

    // Get all expired artifacts using a handler function, operating on one
    // page of results at a time.  This does not use paginatedIterator because
    // that would result in a much slower one-by-one expiration, instead of
    // the parallel handling of each batch.
    const getExpiredArtifacts = async (expires, handler) => {
      let after_task_id_in = null;
      let after_run_id_in = null;
      let after_name_in = null;

      while (true) {
        const rows = await db.fns.get_queue_artifacts_paginated({
          task_id_in: null,
          run_id_in: null,
          expires_in: expires,
          page_size_in: 100,
          after_task_id_in,
          after_run_id_in,
          after_name_in,
        });

        const entries = rows.map(exports.artifactUtils.fromDb);
        await Promise.all(entries.map((item) => handler.call(item, item)));

        if (!rows.length) {
          break;
        } else {
          const lastRow = rows[rows.length - 1];
          after_task_id_in = lastRow.task_id;
          after_run_id_in = lastRow.run_id;
          after_name_in = lastRow.name;
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
const addSplitFields = (obj) => {
  assert(Object.prototype.hasOwnProperty.call(obj, 'taskQueueId'), 'object is missing property `taskQueueId`');
  const { provisionerId, workerType } = splitTaskQueueId(obj.taskQueueId);
  obj.provisionerId = provisionerId;
  obj.workerType = workerType;
};
exports.addSplitFields = addSplitFields;

/**
 * Replace provisionerId and workerType fields in an object with the
 * equivalent taskQueueId.
 */
const useSingleField = (obj) => {
  assert(Object.prototype.hasOwnProperty.call(obj, 'provisionerId'), 'object is missing property `provisionerId`');
  assert(Object.prototype.hasOwnProperty.call(obj, 'workerType'), 'object is missing property `workerType`');
  const taskQueueId = joinTaskQueueId(obj.provisionerId, obj.workerType);
  obj.taskQueueId = taskQueueId;
  delete obj.provisionerId;
  delete obj.workerType;
};
exports.useSingleField = useSingleField;
