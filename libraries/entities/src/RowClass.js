const assert = require('assert').strict;

class RowClass {
  constructor(properties, options = {}) {
    const {
      etag,
      tableName,
      documentId,
      db,
    } = options;

    assert(properties, 'properties is required');
    assert(tableName, 'tableName is required');
    assert(documentId, 'documentId is required');
    assert(db, 'db is required');

    this.properties = properties;
    this.etag = etag;
    this.tableName = tableName;
    this.documentId = documentId;
    this.db = db;
  }

  remove() {
    return this.db.procs[`${this.tableName}_remove`](this.documentId);
  }

  // load the properties from the table once more, and return true if anything has changed.
  // Else, return false.
  async reload() {
    const result = await this.db.procs[`${this.tableName}_load`](this.documentId);
    const etag = result[0].etag;

    return etag !== this.etag;
  }

  async modify(modifier) {
    await modifier.call(this.properties, this.properties);

    return this.db.procs[`${this.tableName}_modify`](this.documentId, this.properties, 1);
  }
}

module.exports = RowClass;
