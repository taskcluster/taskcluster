const assert = require('assert').strict;
const slugid = require('slugid');
const {isPlainObject, isDate} = require('lodash');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

const errWithCode = (msg, code) => {
  const err = new Error(msg);
  err.code = code;
  return err;
};

class FakeIndex {
  constructor() {
    this.indexedTasks = new Map();
    this.namespaces = new Map();
    // table for postgres phase 2
    this.indexedTasks2 = new Map();
  }

  /* helpers */

  reset() {
    this.indexedTasks = new Map();
    this.indexedTasks2 = new Map();
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

  async create_indexed_task(
    namespace, name, rank, task_id,
    data, expires,
  ) {
    assert.equal(typeof namespace, 'string');
    assert.equal(typeof name, 'string');
    assert.equal(typeof rank, 'number');
    assert.equal(typeof task_id, 'string');
    assert(isPlainObject(data));
    assert(isDate(expires));

    if (this.indexedTasks2.get(`${namespace}-${name}`)) {
      throw errWithCode('row exists', UNIQUE_VIOLATION);
    }

    const etag = slugid.v4();

    this.indexedTasks2.set(`${namespace}-${name}`, {
      namespace,
      name,
      rank,
      task_id,
      data,
      expires,
      etag,
    });

    return [{ create_indexed_task: etag }];
  }

  async get_indexed_task(namespace, name) {
    assert.equal(typeof namespace, 'string');
    assert.equal(typeof name, 'string');
    const task = this.indexedTasks2.get(`${namespace}-${name}`);
    if (task && task.expires > new Date()) {
      return [task];
    } else {
      return [];
    }
  }

  async get_indexed_tasks(namespace, name, page_size, page_offset) {
    const indexedTaskKeys = [...this.indexedTasks2.keys()];

    indexedTaskKeys.sort();

    const filteredIndexedTaskKeys = indexedTaskKeys.filter(key => {
      const t = this.indexedTasks2.get(key);
      let include = true;

      if (
        (namespace !== null && namespace !== t.namespace) ||
        (name !== null && name !== t.name) ||
        (t.expires < new Date())
      ) {
        include = false;
      }

      return include;
    });

    return filteredIndexedTaskKeys.slice(page_offset || 0, page_size ?
      page_offset + page_size :
      filteredIndexedTaskKeys.length).map(key => this.indexedTasks2.get(key));
  }

  update_indexed_task(
    namespace, name, rank, task_id,
    data, expires, etag,
  ) {
    const t = this.indexedTasks2.get(`${namespace}-${name}`);

    if (!t) {
      throw errWithCode('no such row', 'P0002');
    }

    if (etag && t.etag !== etag) {
      throw errWithCode('unsuccessful update', 'P0004');
    }

    this.indexedTasks2.set(`${namespace}-${name}`, {
      namespace: namespace || t.namespace,
      name: name || t.name,
      rank: rank || t.rank,
      task_id: task_id || t.task_id,
      data: data || t.data,
      expires: expires || t.expires,
      etag: slugid.v4(),
    });

    return [this.indexedTasks2.get(`${namespace}-${name}`)];
  }

  expire_indexed_tasks() {
    const expired = [];
    for (let [key, t] of this.indexedTasks2.entries()) {
      if (t.expires < new Date()) {
        this.indexedTasks2.delete(key);
        expired.push(t);
      }
    }

    return [{ expire_indexed_tasks: expired.length }];
  }

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

  async indexed_tasks_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.indexedTasks);

    return entries.slice(offset, offset + size + 1);
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

  async namespaces_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.namespaces);

    return entries.slice(offset, offset + size + 1);
  }
}

module.exports = FakeIndex;
