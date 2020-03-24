const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakePurgeCache {
  constructor() {
    this.cachePurges = new Map();
  }

  /* helpers */

  reset() {
    this.cachePurges = new Map();
  }

  _getCachePurge({ partitionKey, rowKey }) {
    return this.cachePurges.get(`${partitionKey}-${rowKey}`);
  }

  _removeCachePurge({ partitionKey, rowKey }) {
    this.cachePurges.delete(`${partitionKey}-${rowKey}`);
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

    this.cachePurges.set(`${c.partition_key_out}-${c.row_key_out}`, c);

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

  async cache_purges_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.cachePurges);

    return entries.slice(offset, offset + size + 1);
  }
}

module.exports = FakePurgeCache;
