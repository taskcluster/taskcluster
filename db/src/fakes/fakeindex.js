const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeIndex {
  constructor() {
    this.indexedTasks = new Set();
    this.namespaces = new Set();
  }

  /* helpers */

  reset() {
    this.indexedTasks = new Set();
    this.namespaces = new Set();
  }

  _getIndexedTask({ partitionKey, rowKey }) {
    for (let c of [...this.indexedTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeIndexedTask({ partitionKey, rowKey }) {
    for (let c of [...this.indexedTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.indexedTasks.delete(c);
        break;
      }
    }
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

    this._removeIndexedTask({ partitionKey: indexedTask.partition_key, rowKey: indexedTask.row_key });
    this.indexedTasks.add(c);

    return c;
  }

  _getRole({ partitionKey, rowKey }) {
    for (let c of [...this.namespaces]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeRole({ partitionKey, rowKey }) {
    for (let c of [...this.namespaces]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.namespaces.delete(c);
        break;
      }
    }
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

    this._removeRole({ partitionKey: namespace.partition_key, rowKey: namespace.row_key });
    this.namespaces.add(c);

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

  // TODO
  async indexed_tasks_entities_scan(partition_key, row_key, condition, size, page) {}

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

  // TODO
  async namespaces_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakeIndex;
