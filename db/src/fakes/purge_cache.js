const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakePurgeCache {
  constructor() {
    this.cachePurges = new Set();
  }

  /* helpers */

  reset() {
    this.cachePurges = new Set();
  }

  _getCachePurge({ partitionKey, rowKey }) {
    for (let c of [...this.cachePurges]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeCachePurge({ partitionKey, rowKey }) {
    for (let c of [...this.cachePurges]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.cachePurges.delete(c);
        break;
      }
    }
  }

  _addCachePurge(cachePurge) {
    assert(typeof cachePurge.partition_key === "string");
    assert(typeof cachePurge.row_key === "string");
    assert(typeof cachePurge.value === "object");
    assert(typeof cachePurge.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: cachePurge.partition_key,
      row_key_out: cachePurge.row_key,
      value: cachePurge.value,
      version: cachePurge.version,
      etag,
    };

    this._removeCachePurge({ partitionKey: cachePurge.partition_key, rowKey: cachePurge.row_key });
    this.cachePurges.add(c);

    return c;
  }

  /* fake functions */

  async cache_purges_entities_load(partitionKey, rowKey) {
    const cachePurge = this._getCachePurge({ partitionKey, rowKey });

    return cachePurge ? [cachePurge] : [];
  }

  async cache_purges_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getCachePurge({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const cachePurge = this._addCachePurge({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'cache_purges_entities_create': cachePurge.etag }];
  }

  async cache_purges_entities_remove(partition_key, row_key) {
    const cachePurge = this._getCachePurge({ partitionKey: partition_key, rowKey: row_key });
    this._removeCachePurge({ partitionKey: partition_key, rowKey: row_key });

    return cachePurge ? [{ etag: cachePurge.etag }] : [];
  }

  async cache_purges_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const cachePurge = this._getCachePurge({ partitionKey: partition_key, rowKey: row_key });

    if (!cachePurge) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (cachePurge.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addCachePurge({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async cache_purges_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakePurgeCache;
