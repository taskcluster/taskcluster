import assert from 'assert';

export const artifactUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return artifactUtils.fromDb(rows[0]);
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
      contentLength: row.content_length != null ? Number(row.content_length) : null,
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
      ...(artifact.contentLength != null ? { contentLength: artifact.contentLength } : {}),
    };
  },
  /**
   * Remove underlying artifact and entity representing it.
   *
   * This method will remove both the artifact in the db and underlying artifact.
   * But the artifact in the db will not be deleted if there is an error
   * deleting the underlying artifact.
   *
   * Not all S3-compatible storage providers support bulk delete, so we
   * need to handle that case.
   */
  async expire({ db, publicBucket, privateBucket, ignoreError, monitor,
    expires, useBulkDelete, expireArtifactsBatchSize }) {
    let count = 0;
    let errorsCount = 0;

    assert(!useBulkDelete || expireArtifactsBatchSize <= 1000, 'expireArtifactsBatchSize must be <= 1000 when useBulkDelete is true');

    // Fetch all expired artifacts and batch delete the S3 ones
    // then remove the entity from the database
    // repeat until there are no more expired artifacts
    while (true) {
      const rows = await db.fns.get_expired_artifacts_for_deletion_2({
        expires_in: expires,
        page_size_in: expireArtifactsBatchSize,
      });
      if (!rows.length) {
        break;
      }

      const entries = rows.map(artifactUtils.fromDb);

      const s3public = [];
      const s3private = [];

      for (const entry of entries) {
        if (entry.storageType === 's3') {
          if (entry.details.bucket === publicBucket.bucket) {
            s3public.push(entry);
          } else if (entry.details.bucket === privateBucket.bucket) {
            s3private.push(entry);
          } else {
            let err = new Error('Expiring artifact with bucket which isn\'t ' +
              'configured for use. Please investigate!');
            err.bucket = entry.details.bucket;
            err.taskId = entry.taskId;
            err.runId = entry.runId;
            monitor.reportError(err);
            continue;
          }
        }
      }

      const errors = [];
      const deleteObjects = async (bucket, entries) => {
        if (entries.length) {
          try {
            const response = await bucket.deleteObjects(entries.map(entry => entry.details.prefix), true);
            if (response.Errors && response.Errors.length) {
              errors.push(response.Errors.map(obj => ({
                code: obj.Code,
                message: obj.Message,
                prefix: obj.Key,
              })));
              errorsCount += response.Errors.length;

              // this will likely be a soft error, so we'll just log it
              const err = new Error('Failed to delete s3 objects');
              err.entries = errors;
              monitor.reportError(err);
            }
          } catch (err) {
            // and this is an api response error, most likely network issue or this needs to be retried
            monitor.debug('WARNING: Failed to delete expired artifacts: %s, %j', err, err);
            if (!ignoreError) {
              throw err;
            }
          }
        }
      };
      const deleteSingleObject = async (bucket, entry) => {
        try {
          return await bucket.deleteObject(entry.details.prefix);
        } catch (err) {
          errorsCount++;
          // Some S3-compatible storage providers might throw an error when file is missing
          // where AWS S3 would return 204 response without body
          // GCS: https://cloud.google.com/storage/docs/xml-api/delete-object
          // S3: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
          if (`${err.code} ${err.name} ${err.message}`.includes('NoSuchKey')) {
            monitor.debug(
              'WARNING: Failed to delete missing S3 object: %s:%s %j',
              bucket.bucket, entry.details.prefix, err,
            );
          } else {
            throw err;
          }
        }
      };

      monitor.debug({
        message: 'Removing artifacts from buckets',
        publicCount: s3public.length,
        privateCount: s3private.length,
      });

      // only s3 artifacts need to be deleted
      // 'object' artifacts are deleted at expiration by the object service
      // if this fails, we stop and don't delete the db entry
      if (useBulkDelete) {
        await Promise.all([
          deleteObjects(publicBucket, s3public),
          deleteObjects(privateBucket, s3private),
        ]);
      } else {
        await Promise.allSettled(s3public.map(entry => deleteSingleObject(publicBucket, entry)));
        await Promise.allSettled(s3private.map(entry => deleteSingleObject(privateBucket, entry)));
      }

      monitor.debug({
        message: 'Removed artifacts from buckets',
        errors: errors,
      });

      try {
        // delete all the artifacts from the db
        await db.fns.delete_queue_artifacts(
          JSON.stringify(entries.map(({ taskId: task_id, runId: run_id, name }) =>
            ({ task_id, run_id, name }))),
        );

        count += entries.length;
        const totalContentLength = entries.reduce((sum, e) => {
          return e.contentLength != null ? sum + e.contentLength : sum;
        }, 0);
        monitor.debug({
          message: 'Deleted artifacts from db',
          batch: entries.length,
          total: count,
          deletedContentLength: totalContentLength,
        });
      } catch (err) {
        monitor.debug('WARNING: Failed to delete expired artifacts: %s, %j', err, err);
        // Rethrow error, if we're not supposed to ignore it.
        if (!ignoreError) {
          throw err;
        }
      }
    }

    return { count, errorsCount };
  },
};

/**
 * Split a taskQueueId into its deprecated provisionerId/workerType components.
 */
export const splitTaskQueueId = taskQueueId => {
  const split = taskQueueId.split('/');
  assert.equal(split.length, 2, `invalid taskQueueId ${taskQueueId}`);
  return { provisionerId: split[0], workerType: split[1] };
};

/**
 * Join a provisionerId and workerType to make a taskQueueId
 */
export const joinTaskQueueId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};

/**
 * Add the provisionerId, workerType fields to an object that has a
 * taskQueueId field to maintain public interface compatibility
 */
export const addSplitFields = (obj) => {
  assert(Object.prototype.hasOwnProperty.call(obj, 'taskQueueId'), 'object is missing property `taskQueueId`');
  const { provisionerId, workerType } = splitTaskQueueId(obj.taskQueueId);
  obj.provisionerId = provisionerId;
  obj.workerType = workerType;
};

/**
 * Replace provisionerId and workerType fields in an object with the
 * equivalent taskQueueId.
 */
export const useOnlyTaskQueueId = (obj) => {
  assert(Object.prototype.hasOwnProperty.call(obj, 'provisionerId'), 'object is missing property `provisionerId`');
  assert(Object.prototype.hasOwnProperty.call(obj, 'workerType'), 'object is missing property `workerType`');
  const taskQueueId = joinTaskQueueId(obj.provisionerId, obj.workerType);
  obj.taskQueueId = taskQueueId;
  delete obj.provisionerId;
  delete obj.workerType;
};

/** Sleep for `delay` ms, returns a promise */
export const sleep = (delay) => new Promise((accept) => setTimeout(accept, delay));

export default { artifactUtils, splitTaskQueueId, joinTaskQueueId, addSplitFields, useOnlyTaskQueueId, sleep };
