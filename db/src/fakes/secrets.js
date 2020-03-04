const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeSecrets {
  constructor() {
    this.secret_s = new Set();
  }

  /* helpers */

  reset() {
    this.secret_s = new Set();
  }

  _getSecret_({ partitionKey, rowKey }) {
    for (let c of [...this.secret_s]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeSecret_({ partitionKey, rowKey }) {
    for (let c of [...this.secret_s]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.secret_s.delete(c);
        break;
      }
    }
  }

  _addSecret_(secret_) {
    assert(typeof secret_.partition_key === "string");
    assert(typeof secret_.row_key === "string");
    assert(typeof secret_.value === "object");
    assert(typeof secret_.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: secret_.partition_key,
      row_key_out: secret_.row_key,
      value: secret_.value,
      version: secret_.version,
      etag,
    };

    this._removeSecret_({ partitionKey: secret_.partition_key, rowKey: secret_.row_key });
    this.secret_s.add(c);

    return c;
  }

  /* fake functions */

  async secrets_entities_load(partitionKey, rowKey) {
    const secret_ = this._getSecret_({ partitionKey, rowKey });

    return secret_ ? [secret_] : [];
  }

  async secrets_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getSecret_({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const secret_ = this._addSecret_({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'secrets_entities_create': secret_.etag }];
  }

  async secrets_entities_remove(partition_key, row_key) {
    const secret_ = this._getSecret_({ partitionKey: partition_key, rowKey: row_key });
    this._removeSecret_({ partitionKey: partition_key, rowKey: row_key });

    return secret_ ? [{ etag: secret_.etag }] : [];
  }

  async secrets_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const secret_ = this._getSecret_({ partitionKey: partition_key, rowKey: row_key });

    if (!secret_) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (secret_.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addSecret_({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async secrets_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakeSecrets;
