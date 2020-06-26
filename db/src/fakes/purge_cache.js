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

  _getCaches() {
    return [...this.cachePurges.values()];
  }

  _getCachePurge({ partitionKey, rowKey }) {
    return this.cachePurges.get(`${partitionKey}-${rowKey}`);
  }

  _getCachePurge2({ provisionerId, workerType, cacheName }) {
    return this.cachePurges.get(`${provisionerId}-${workerType}-${cacheName}`);
  }

  _removeCachePurge({ partitionKey, rowKey }) {
    this.cachePurges.delete(`${partitionKey}-${rowKey}`);
  }

  _removeCachePurge2(cache) {
    this.cachePurges.delete(`${cache.provisioner_id}-${cache.worker_type}-${cache.cache_name}`);
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

  _addCachePurge2(cachePurge) {
    assert(typeof cachePurge.provisioner_id === "string");
    assert(typeof cachePurge.worker_type === "string");
    assert(typeof cachePurge.cache_name === "string");
    assert(cachePurge.before instanceof Date);
    assert(cachePurge.expires instanceof Date);

    const etag = slugid.v4();
    const c = {
      provisioner_id: cachePurge.provisioner_id,
      worker_type: cachePurge.worker_type,
      cache_name: cachePurge.cache_name,
      before: cachePurge.before,
      expires: cachePurge.expires,
      etag,
    };

    this.cachePurges.set(`${c.provisioner_id}-${c.worker_type}-${c.cache_name}`, c);

    return c;
  }

  /* fake functions */

  async cache_purges_entities_load(partitionKey, rowKey) {
    const cachePurge = this._getCachePurge({ partitionKey, rowKey });

    return cachePurge ? [cachePurge] : [];
  }

  async purge_requests(provisionerId, workerType) {
    const cachePurges = this._getCaches();

    return cachePurges
      .filter(cache => {
        return cache.provisioner_id === provisionerId && cache.worker_type === workerType;
      })
      .map(cache => {
        return {
          provisioner_id: cache.provisioner_id,
          worker_type: cache.worker_type,
          cache_name: cache.cache_name,
          before: cache.before,
        };
      });
  }

  async expire_cache_purges(exp) {
    const cachePurges = this._getCaches();
    let count = 0;

    cachePurges.forEach(cache => {
      if (cache.expires < exp) {
        count += 1;
        this._removeCachePurge2(cache);
      }
    });

    return [{ 'expire_cache_purges': count }];
  }

  async cache_purges_load(provisionerId, workerType, cacheName) {
    const cachePurge = this._getCachePurge2({ provisionerId, workerType, cacheName });

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

  async purge_cache(provisioner_id, worker_type, cache_name, before, expires) {
    const cachePurge = this._addCachePurge2({
      provisioner_id,
      worker_type,
      cache_name,
      before,
      expires,
    });

    return [{ 'purge_cache': cachePurge.etag }];
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

  async all_purge_requests(size, page) {
    return [...this.cachePurges.values()]
      .map(cache => {
        delete cache.expires;
        delete cache.etag;

        return cache;
      })
      .slice(page, page + size);
  }
}

module.exports = FakePurgeCache;
