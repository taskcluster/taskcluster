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
      etag: row.etag,
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
    }
  },
};

exports.artifactUtils = artifactUtils;
