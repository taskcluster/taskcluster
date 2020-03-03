const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeGithub {
  constructor() {
    this.hooks = new Set();
    this.lastFire3s = new Set();
    this.queues = new Set();
  }

  /* helpers */

  reset() {
    this.hooks = new Set();
    this.lastFire3s = new Set();
    this.queues = new Set();
  }

  _getHook({ partitionKey, rowKey }) {
    for (let c of [...this.hooks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeHook({ partitionKey, rowKey }) {
    for (let c of [...this.hooks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.hooks.delete(c);
        break;
      }
    }
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

    this._removeHook({ partitionKey: hook.partition_key, rowKey: hook.row_key });
    this.hooks.add(c);

    return c;
  }

  _getLastFire3({ partitionKey, rowKey }) {
    for (let c of [...this.lastFire3s]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeLastFire3({ partitionKey, rowKey }) {
    for (let c of [...this.lastFire3s]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.lastFire3s.delete(c);
        break;
      }
    }
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

    this._removeLastFire3({ partitionKey: lastFire3.partition_key, rowKey: lastFire3.row_key });
    this.lastFire3s.add(c);

    return c;
  }

  _getQueue({ partitionKey, rowKey }) {
    for (let c of [...this.queues]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueue({ partitionKey, rowKey }) {
    for (let c of [...this.queues]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queues.delete(c);
        break;
      }
    }
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

    this._removeQueue({ partitionKey: queue.partition_key, rowKey: queue.row_key });
    this.queues.add(c);

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

  // TODO
  async hooks_entities_scan(partition_key, row_key, condition, size, page) {}

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

  // TODO
  async last_fire3_entities_scan(partition_key, row_key, condition, size, page) {}

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

  // TODO
  async queues_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakeGithub;
