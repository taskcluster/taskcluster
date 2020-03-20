const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakeIndex {
  constructor() {
    this.indexedTasks = new Map();
    this.namespaces = new Map();
  }

  /* helpers */

  reset() {
    this.indexedTasks = new Map();
    this.namespaces = new Map();
  }

  _getIndexedTask({ partitionKey, rowKey }) {
    return this.indexedTasks.get(`${partitionKey}-${rowKey}`);
  }

  _removeIndexedTask({ partitionKey, rowKey }) {
    this.indexedTasks.delete(`${partitionKey}-${rowKey}`);
  }

  _addIndexedTask(indexedTask) {
    assert(typeof indexedTask.partition_key === "string");
    assert(typeof indexedTask.row_key === "string");
    assert(typeof indexedTask.value === "object");
    assert(typeof indexedTask.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: indexedTask.partition_key,
      row_key_out: indexedTask.row_key,
      value: indexedTask.value,
      version: indexedTask.version,
      etag,
    };

    this.indexedTasks.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getRole({ partitionKey, rowKey }) {
    return this.namespaces.get(`${partitionKey}-${rowKey}`);
  }

  _removeRole({ partitionKey, rowKey }) {
    this.namespaces.delete(`${partitionKey}-${rowKey}`);
  }

  _addRole(namespace) {
    assert(typeof namespace.partition_key === "string");
    assert(typeof namespace.row_key === "string");
    assert(typeof namespace.value === "object");
    assert(typeof namespace.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: namespace.partition_key,
      row_key_out: namespace.row_key,
      value: namespace.value,
      version: namespace.version,
      etag,
    };

    this.namespaces.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  /* fake functions */

  async indexed_tasks_entities_load(partitionKey, rowKey) {
    const indexedTask = this._getIndexedTask({ partitionKey, rowKey });

    return indexedTask ? [indexedTask] : [];
  }

  async indexed_tasks_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getIndexedTask({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const indexedTask = this._addIndexedTask({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'indexed_tasks_entities_create': indexedTask.etag }];
  }

  async indexed_tasks_entities_remove(partition_key, row_key) {
    const indexedTask = this._getIndexedTask({ partitionKey: partition_key, rowKey: row_key });
    this._removeIndexedTask({ partitionKey: partition_key, rowKey: row_key });

    return indexedTask ? [{ etag: indexedTask.etag }] : [];
  }

  async indexed_tasks_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const indexedTask = this._getIndexedTask({ partitionKey: partition_key, rowKey: row_key });

    if (!indexedTask) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (indexedTask.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addIndexedTask({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async indexed_tasks_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.indexedTasks);

    return entries.slice((page - 1) * size, (page - 1) * size + size + 1);
  }

  async namespaces_entities_load(partitionKey, rowKey) {
    const namespace = this._getRole({ partitionKey, rowKey });

    return namespace ? [namespace] : [];
  }

  async namespaces_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getRole({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const namespace = this._addRole({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'namespaces_entities_create': namespace.etag }];
  }

  async namespaces_entities_remove(partition_key, row_key) {
    const namespace = this._getRole({ partitionKey: partition_key, rowKey: row_key });
    this._removeRole({ partitionKey: partition_key, rowKey: row_key });

    return namespace ? [{ etag: namespace.etag }] : [];
  }

  async namespaces_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const namespace = this._getRole({ partitionKey: partition_key, rowKey: row_key });

    if (!namespace) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (namespace.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addRole({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async namespaces_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.namespaces);

    return entries.slice((page - 1) * size, (page - 1) * size + size + 1);
  }
}

module.exports = FakeIndex;
