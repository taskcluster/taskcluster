const assert = require("assert");
const slugid = require("slugid");
const { UNIQUE_VIOLATION } = require("taskcluster-lib-postgres");
const { getEntries } = require("../utils");

class FakeNotify {
  constructor() {
    this.denylistedNotifications = new Map();
  }

  /* helpers */

  reset() {
    this.denylistedNotifications = new Map();
  }

  _getDenylistedNotification({ partitionKey, rowKey }) {
    return this.denylistedNotifications.get(`${partitionKey}-${rowKey}`);
  }

  _removeDenylistedNotification({ partitionKey, rowKey }) {
    this.denylistedNotifications.delete(`${partitionKey}-${rowKey}`);
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

    this.denylistedNotifications.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  /* fake functions */

  async denylisted_notification_entities_load(partitionKey, rowKey) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey, rowKey });

    return denylistedNotification ? [denylistedNotification] : [];
  }

  async denylisted_notification_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const denylistedNotification = this._addDenylistedNotification({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "denylisted_notification_entities_create": denylistedNotification.etag }];
  }

  async denylisted_notification_entities_remove(partition_key, row_key) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });
    this._removeDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });

    return denylistedNotification ? [{ etag: denylistedNotification.etag }] : [];
  }

  async denylisted_notification_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const denylistedNotification = this._getDenylistedNotification({ partitionKey: partition_key, rowKey: row_key });

    if (!denylistedNotification) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (denylistedNotification.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addDenylistedNotification({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async denylisted_notification_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.denylistedNotifications);

    return entries.slice(offset, offset + size + 1);
  }

  async update_widgets(name) {
    // this function now does nothing
    return [];
  }
}

module.exports = FakeNotify;
