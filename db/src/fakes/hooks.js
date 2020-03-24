const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakeHook {
  constructor() {
    this.hooks = new Map();
    this.lastFire3s = new Map();
    this.queues = new Map();
  }

  /* helpers */

  reset() {
    this.hooks = new Map();
    this.lastFire3s = new Map();
    this.queues = new Map();
  }

  _getHook({ partitionKey, rowKey }) {
    return this.hooks.get(`${partitionKey}-${rowKey}`);
  }

  _removeHook({ partitionKey, rowKey }) {
    this.hooks.delete(`${partitionKey}-${rowKey}`);
  }

  _addHook(hook) {
    assert(typeof hook.partition_key === "string");
    assert(typeof hook.row_key === "string");
    assert(typeof hook.value === "object");
    assert(typeof hook.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: hook.partition_key,
      row_key_out: hook.row_key,
      value: hook.value,
      version: hook.version,
      etag,
    };

    this.hooks.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getLastFire3({ partitionKey, rowKey }) {
    return this.lastFire3s.get(`${partitionKey}-${rowKey}`);
  }

  _removeLastFire3({ partitionKey, rowKey }) {
    this.lastFire3s.delete(`${partitionKey}-${rowKey}`);
  }

  _addLastFire3(lastFire3) {
    assert(typeof lastFire3.partition_key === "string");
    assert(typeof lastFire3.row_key === "string");
    assert(typeof lastFire3.value === "object");
    assert(typeof lastFire3.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: lastFire3.partition_key,
      row_key_out: lastFire3.row_key,
      value: lastFire3.value,
      version: lastFire3.version,
      etag,
    };

    this.lastFire3s.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueue({ partitionKey, rowKey }) {
    return this.queues.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueue({ partitionKey, rowKey }) {
    this.queues.delete(`${partitionKey}-${rowKey}`);
  }

  _addQueue(queue) {
    assert(typeof queue.partition_key === "string");
    assert(typeof queue.row_key === "string");
    assert(typeof queue.value === "object");
    assert(typeof queue.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queue.partition_key,
      row_key_out: queue.row_key,
      value: queue.value,
      version: queue.version,
      etag,
    };

    this.queues.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  /* fake functions */

  async hooks_entities_load(partitionKey, rowKey) {
    const hook = this._getHook({ partitionKey, rowKey });

    return hook ? [hook] : [];
  }

  async hooks_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getHook({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const hook = this._addHook({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'hooks_entities_create': hook.etag }];
  }

  async hooks_entities_remove(partition_key, row_key) {
    const hook = this._getHook({ partitionKey: partition_key, rowKey: row_key });
    this._removeHook({ partitionKey: partition_key, rowKey: row_key });

    return hook ? [{ etag: hook.etag }] : [];
  }

  async hooks_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const hook = this._getHook({ partitionKey: partition_key, rowKey: row_key });

    if (!hook) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (hook.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addHook({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async hooks_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.hooks);

    return entries.slice(offset, offset + size + 1);
  }

  async last_fire3_entities_load(partitionKey, rowKey) {
    const lastFire3 = this._getLastFire3({ partitionKey, rowKey });

    return lastFire3 ? [lastFire3] : [];
  }

  async last_fire3_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getLastFire3({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const lastFire3 = this._addLastFire3({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'last_fire3_entities_create': lastFire3.etag }];
  }

  async last_fire3_entities_remove(partition_key, row_key) {
    const lastFire3 = this._getLastFire3({ partitionKey: partition_key, rowKey: row_key });
    this._removeLastFire3({ partitionKey: partition_key, rowKey: row_key });

    return lastFire3 ? [{ etag: lastFire3.etag }] : [];
  }

  async last_fire3_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const lastFire3 = this._getLastFire3({ partitionKey: partition_key, rowKey: row_key });

    if (!lastFire3) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (lastFire3.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addLastFire3({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async last_fire3_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.lastFire3s);

    return entries.slice(offset, offset + size + 1);
  }

  /* fake functions */

  async queues_entities_load(partitionKey, rowKey) {
    const queue = this._getQueue({ partitionKey, rowKey });

    return queue ? [queue] : [];
  }

  async queues_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueue({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queue = this._addQueue({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queues_entities_create': queue.etag }];
  }

  async queues_entities_remove(partition_key, row_key) {
    const queue = this._getQueue({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueue({ partitionKey: partition_key, rowKey: row_key });

    return queue ? [{ etag: queue.etag }] : [];
  }

  async queues_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queue = this._getQueue({ partitionKey: partition_key, rowKey: row_key });

    if (!queue) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queue.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueue({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async queues_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queues);

    return entries.slice(offset, offset + size + 1);
  }
}

module.exports = FakeHook;
