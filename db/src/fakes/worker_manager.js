const _ = require('lodash');
const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');
const {isPlainObject, isDate} = require('lodash');

const errWithCode = (msg, code) => {
  const err = new Error(msg);
  err.code = code;
  return err;
};

class FakeWorkerManager {
  constructor() {
    this.reset();
  }

  /* helpers */

  reset() {
    this.wmWorkers = new Map();
    this.wmWorkerPools = new Map();
    this.wmWorkerPoolErrors = new Map();
    this.worker_pools = new Map();
  }

  _getWmWorker({ partitionKey, rowKey }) {
    return this.wmWorkers.get(`${partitionKey}-${rowKey}`);
  }

  _removeWmWorker({ partitionKey, rowKey }) {
    this.wmWorkers.delete(`${partitionKey}-${rowKey}`);
  }

  _addWmWorker(wmWorker) {
    assert(typeof wmWorker.partition_key === "string");
    assert(typeof wmWorker.row_key === "string");
    assert(typeof wmWorker.value === "object");
    assert(typeof wmWorker.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorker.partition_key,
      row_key_out: wmWorker.row_key,
      value: wmWorker.value,
      version: wmWorker.version,
      etag,
    };

    this.wmWorkers.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getWmWorkerPool({ partitionKey, rowKey }) {
    return this.wmWorkerPools.get(`${partitionKey}-${rowKey}`);
  }

  _removeWmWorkerPool({ partitionKey, rowKey }) {
    this.wmWorkerPools.delete(`${partitionKey}-${rowKey}`);
  }

  _addWmWorkerPool(wmWorkerPool) {
    assert(typeof wmWorkerPool.partition_key === "string");
    assert(typeof wmWorkerPool.row_key === "string");
    assert(typeof wmWorkerPool.value === "object");
    assert(typeof wmWorkerPool.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorkerPool.partition_key,
      row_key_out: wmWorkerPool.row_key,
      value: wmWorkerPool.value,
      version: wmWorkerPool.version,
      etag,
    };

    this.wmWorkerPools.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getWmWorkerPoolError({ partitionKey, rowKey }) {
    return this.wmWorkerPoolErrors.get(`${partitionKey}-${rowKey}`);
  }

  _removeWmWorkerPoolError({ partitionKey, rowKey }) {
    this.wmWorkerPoolErrors.delete(`${partitionKey}-${rowKey}`);
  }

  _addWmWorkerPoolError(wmWorkerPoolError) {
    assert(typeof wmWorkerPoolError.partition_key === "string");
    assert(typeof wmWorkerPoolError.row_key === "string");
    assert(typeof wmWorkerPoolError.value === "object");
    assert(typeof wmWorkerPoolError.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorkerPoolError.partition_key,
      row_key_out: wmWorkerPoolError.row_key,
      value: wmWorkerPoolError.value,
      version: wmWorkerPoolError.version,
      etag,
    };

    this.wmWorkerPoolErrors.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  /* fake functions */

  async wmworkers_entities_load(partitionKey, rowKey) {
    const wmWorker = this._getWmWorker({ partitionKey, rowKey });

    return wmWorker ? [wmWorker] : [];
  }

  async wmworkers_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorker({ partitionKey: partition_key, rowKey: row_key })) {
      throw errWithCode('duplicate key value violates unique constraint', UNIQUE_VIOLATION);
    }

    const wmWorker = this._addWmWorker({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wmworkers_entities_create': wmWorker.etag }];
  }

  async wmworkers_entities_remove(partition_key, row_key) {
    const wmWorker = this._getWmWorker({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorker({ partitionKey: partition_key, rowKey: row_key });

    return wmWorker ? [{ etag: wmWorker.etag }] : [];
  }

  async wmworkers_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorker = this._getWmWorker({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorker) {
      throw errWithCode('no such row', 'P0002');
    }

    if (wmWorker.etag !== oldEtag) {
      throw errWithCode('unsuccessful update', 'P0004');
    }

    const c = this._addWmWorker({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wmworkers_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkers);

    return entries.slice(offset, offset + size + 1);
  }

  async wmworker_pools_entities_load(partitionKey, rowKey) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey, rowKey });

    return wmWorkerPool ? [wmWorkerPool] : [];
  }

  async wmworker_pools_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key })) {
      throw errWithCode('duplicate key value violates unique constraint', UNIQUE_VIOLATION);
    }

    const wmWorkerPool = this._addWmWorkerPool({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wmworker_pools_entities_create': wmWorkerPool.etag }];
  }

  async wmworker_pools_entities_remove(partition_key, row_key) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });

    return wmWorkerPool ? [{ etag: wmWorkerPool.etag }] : [];
  }

  async wmworker_pools_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorkerPool) {
      throw errWithCode('no such row', 'P0002');
    }

    if (wmWorkerPool.etag !== oldEtag) {
      throw errWithCode('unsuccessful update', 'P0004');
    }

    const c = this._addWmWorkerPool({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wmworker_pools_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkerPools);

    return entries.slice(offset, offset + size + 1);
  }

  /* fake functions */

  async wmworker_pool_errors_entities_load(partitionKey, rowKey) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey, rowKey });

    return wmWorkerPoolError ? [wmWorkerPoolError] : [];
  }

  async wmworker_pool_errors_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key })) {
      throw errWithCode('duplicate key value violates unique constraint', UNIQUE_VIOLATION);
    }

    const wmWorkerPoolError = this._addWmWorkerPoolError({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wmworker_pool_errors_entities_create': wmWorkerPoolError.etag }];
  }

  async wmworker_pool_errors_entities_remove(partition_key, row_key) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });

    return wmWorkerPoolError ? [{ etag: wmWorkerPoolError.etag }] : [];
  }

  async wmworker_pool_errors_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorkerPoolError) {
      throw errWithCode('no such row', 'P0002');
    }

    if (wmWorkerPoolError.etag !== oldEtag) {
      throw errWithCode('unsuccessful update', 'P0004');
    }

    const c = this._addWmWorkerPoolError({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wmworker_pool_errors_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkerPoolErrors);
    return entries.slice(offset, offset + size + 1);
  }

  async create_worker_pool(
    worker_pool_id, provider_id, previous_provider_ids, description,
    config, created, last_modified, owner, email_on_error, provider_data) {
    assert.equal(typeof worker_pool_id, 'string');
    assert.equal(typeof provider_id, 'string');
    // node-pg cannot correctly encode JS arrays as JSONB, so they are given to us
    // as a JSON string https://github.com/brianc/node-postgres/issues/2012
    previous_provider_ids = JSON.parse(previous_provider_ids);
    assert(Array.isArray(previous_provider_ids));
    assert.equal(typeof description, 'string');
    assert(isPlainObject(config));
    assert(isDate(created));
    assert(isDate(last_modified));
    assert.equal(typeof owner, 'string');
    assert.equal(typeof email_on_error, 'boolean');
    assert(isPlainObject(provider_data));

    if (this.worker_pools.get(worker_pool_id)) {
      throw errWithCode('row exists', UNIQUE_VIOLATION);
    }

    this.worker_pools.set(worker_pool_id, {
      worker_pool_id,
      provider_id,
      previous_provider_ids,
      description,
      config,
      created,
      last_modified,
      owner,
      email_on_error,
      provider_data});
  }

  async get_worker_pool(worker_pool_id) {
    assert.equal(typeof worker_pool_id, 'string');
    if (this.worker_pools.has(worker_pool_id)) {
      return [this.worker_pools.get(worker_pool_id)];
    } else {
      return [];
    }
  }

  async get_worker_pools(page_size, page_offset) {
    const wpids = [...this.worker_pools.keys()];
    wpids.sort();
    return wpids
      .slice(page_offset || 0, page_size ? page_offset + page_size : wpids.length)
      .map(wpid => this.worker_pools.get(wpid));
  }

  async update_worker_pool(
    worker_pool_id, provider_id, description, config, last_modified,
    owner, email_on_error) {
    assert.equal(typeof worker_pool_id, 'string');
    assert.equal(typeof provider_id, 'string');
    assert.equal(typeof description, 'string');
    assert(isPlainObject(config));
    assert(isDate(last_modified));
    assert.equal(typeof owner, 'string');
    assert.equal(typeof email_on_error, 'boolean');
    if (!this.worker_pools.has(worker_pool_id)) {
      return [];
    }
    const wp = this.worker_pools.get(worker_pool_id);
    const previous_provider_id = wp.provider_id;
    if (previous_provider_id !== provider_id) {
      wp.previous_provider_ids = wp.previous_provider_ids
        .filter(p => p !== provider_id)
        .filter(p => p !== previous_provider_id)
        .concat([previous_provider_id]);
    }
    wp.provider_id = provider_id;
    wp.description = description;
    wp.config = config;
    wp.last_modified = last_modified;
    wp.owner = owner;
    wp.email_on_error = email_on_error;

    return [{..._.omit(wp, 'provider_data', 'previous_provider_ids'), previous_provider_id}];
  }

  async expire_worker_pools() {
    const expired = [];
    for (let [workerPoolId, wp] of this.worker_pools.entries()) {
      if (wp.provider_id === 'null-provider' &&
          Object.keys(wp.previous_provider_ids).length === 0) {
        this.worker_pools.delete(workerPoolId);
        expired.push({worker_pool_id: workerPoolId});
      }
    }
    return expired;
  }

  async delete_worker_pool(worker_pool_id) {
    this.worker_pools.delete(worker_pool_id);
  }

  async remove_worker_pool_previous_provider_id(worker_pool_id, provider_id) {
    assert.equal(typeof worker_pool_id, 'string');
    assert.equal(typeof provider_id, 'string');
    const wp = this.worker_pools.get(worker_pool_id);
    if (wp) {
      wp.previous_provider_ids = wp.previous_provider_ids.filter(p => p !== provider_id);
    }
  }

  async update_worker_pool_provider_data(worker_pool_id, provider_id, provider_data) {
    assert.equal(typeof worker_pool_id, 'string');
    assert.equal(typeof provider_id, 'string');
    assert(isPlainObject(provider_data));
    const wp = this.worker_pools.get(worker_pool_id);
    if (wp) {
      wp.provider_data[provider_id] = provider_data;
    }
  }
}

module.exports = FakeWorkerManager;
