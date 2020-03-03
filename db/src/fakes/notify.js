const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeNotify {
  constructor() {
    this.widgets = new Set();
    this.denylistedNotifications = new Set();
  }

  /* helpers */

  reset() {
    this.widgets = new Set();
    this.denylistedNotifications = new Set();
  }

  addWidget(name) {
    assert(typeof name === "string");
    this.widgets.add(name);
  }

  _getDenylistedNotification({ partitionKey, rowKey }) {
    for (let c of [...this.denylistedNotifications]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeDenylistedNotification({ partitionKey, rowKey }) {
    for (let c of [...this.denylistedNotifications]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.denylistedNotifications.delete(c);
        break;
      }
    }
  }

  _addDenylistedNotification(denylistedNotification) {
    assert(typeof denylistedNotification.partition_key === "string");
    assert(typeof denylistedNotification.row_key === "string");
    assert(typeof denylistedNotification.value === "object");
    assert(typeof denylistedNotification.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: denylistedNotification.partition_key,
      row_key_out: denylistedNotification.row_key,
      value: denylistedNotification.value,
      version: denylistedNotification.version,
      etag,
    };

    this._removeDenylistedNotification({ partitionKey: denylistedNotification.partition_key, rowKey: denylistedNotification.row_key });
    this.denylistedNotifications.add(c);

    return c;
  }

  /* fake functions */

  async denylisted_notification_entities_load(partitionKey, rowKey) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey, rowKey });

    return denylistedNotification ? [denylistedNotification] : [];
  }

  async denylisted_notification_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const denylistedNotification = this._addDenylistedNotification({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'denylisted_notification_entities_create': denylistedNotification.etag }];
  }

  async denylisted_notification_entities_remove(partition_key, row_key) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });
    this._removeDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });

    return denylistedNotification ? [{ etag: denylistedNotification.etag }] : [];
  }

  async denylisted_notification_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });

    if (!denylistedNotification) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (denylistedNotification.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addDenylistedNotification({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async denylisted_notification_entities_scan(partition_key, row_key, condition, size, page) {}

  async update_widgets(name) {
    this.widgets.add(name);
    return [...this.widgets].map(name => ({name}));
  }
}

module.exports = FakeNotify;
