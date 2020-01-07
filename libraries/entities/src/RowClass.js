const assert = require('assert').strict;
const {} = require('taskcluster-lib-postgres');

class RowClass {
  constructor(properties, options = {}) {
    const {
      etag,
      tableName,
      documentId,
      db,
    } = options;

    this.properties = properties;
    this.etag = etag;
    this.tableName = tableName;
    this.documentId = documentId;
    this.db = db;
  }

  /*
    Remove a row if not modified, unless `ignoreChanges` is set. Also,
    if `ignoreIfNotExists` is true, then this will cause the method return
    successfully if the row is not present.
   */
  remove(ignoreChanges, ignoreIfNotExists) {

  }

  // load the properties from the table once more, and return true if anything has changed.
  // Else, return false.
  async reload() {
    const result = await this.db.procs[`${this.tableName}_load`](this.documentId);
    const etag = result[0].etag;

    return etag !== this.etag;
  }

  modify() {

  }
}

module.exports = RowClass;
