const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require("../utils");

class FakeAuth {
  constructor() {
    this.authorizationCodesTables = new Map();
    this.accessTokenTables = new Map();
    this.sessionStorageTables = new Map();
    this.githubAccessTokenTables = new Map();
  }

  /* helpers */

  reset() {
    this.authorizationCodesTables = new Map();
    this.accessTokenTables = new Map();
    this.sessionStorageTables = new Map();
    this.githubAccessTokenTables = new Map();
  }

  _getAuthorizationCodesTable({ partitionKey, rowKey }) {
    return this.authorizationCodesTables.get(`${partitionKey}-${rowKey}`);
  }

  _removeAuthorizationCodesTable({ partitionKey, rowKey }) {
    this.authorizationCodesTables.delete(`${partitionKey}-${rowKey}`);
  }

  _addAuthorizationCodesTable(authorizationCodesTable) {
    assert(typeof authorizationCodesTable.partition_key === "string");
    assert(typeof authorizationCodesTable.row_key === "string");
    assert(typeof authorizationCodesTable.value === "object");
    assert(typeof authorizationCodesTable.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: authorizationCodesTable.partition_key,
      row_key_out: authorizationCodesTable.row_key,
      value: authorizationCodesTable.value,
      version: authorizationCodesTable.version,
      etag,
    };

    this.authorizationCodesTables.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getAccessTokenTable({ partitionKey, rowKey }) {
    return this.accessTokenTables.get(`${partitionKey}-${rowKey}`);
  }

  _removeAccessTokenTable({ partitionKey, rowKey }) {
    this.accessTokenTables.delete(`${partitionKey}-${rowKey}`);
  }

  _addAccessTokenTable(accessTokenTable) {
    assert(typeof accessTokenTable.partition_key === "string");
    assert(typeof accessTokenTable.row_key === "string");
    assert(typeof accessTokenTable.value === "object");
    assert(typeof accessTokenTable.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: accessTokenTable.partition_key,
      row_key_out: accessTokenTable.row_key,
      value: accessTokenTable.value,
      version: accessTokenTable.version,
      etag,
    };

    this.accessTokenTables.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getSessionStorageTable({ partitionKey, rowKey }) {
    return this.sessionStorageTables.get(`${partitionKey}-${rowKey}`);
  }

  _removeSessionStorageTable({ partitionKey, rowKey }) {
    this.sessionStorageTables.delete(`${partitionKey}-${rowKey}`);
  }

  _addSessionStorageTable(sessionStorageTable) {
    assert(typeof sessionStorageTable.partition_key === "string");
    assert(typeof sessionStorageTable.row_key === "string");
    assert(typeof sessionStorageTable.value === "object");
    assert(typeof sessionStorageTable.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: sessionStorageTable.partition_key,
      row_key_out: sessionStorageTable.row_key,
      value: sessionStorageTable.value,
      version: sessionStorageTable.version,
      etag,
    };

    this.sessionStorageTables.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getGithubAccessTokenTable({ partitionKey, rowKey }) {
    return this.githubAccessTokenTables.get(`${partitionKey}-${rowKey}`);
  }

  _removeGithubAccessTokenTable({ partitionKey, rowKey }) {
    this.githubAccessTokenTables.delete(`${partitionKey}-${rowKey}`);
  }

  _addGithubAccessTokenTable(githubAccessTokenTable) {
    assert(typeof githubAccessTokenTable.partition_key === "string");
    assert(typeof githubAccessTokenTable.row_key === "string");
    assert(typeof githubAccessTokenTable.value === "object");
    assert(typeof githubAccessTokenTable.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: githubAccessTokenTable.partition_key,
      row_key_out: githubAccessTokenTable.row_key,
      value: githubAccessTokenTable.value,
      version: githubAccessTokenTable.version,
      etag,
    };

    this.githubAccessTokenTables.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  /* fake functions */

  async authorization_codes_table_entities_load(partitionKey, rowKey) {
    const authorizationCodesTable = this._getAuthorizationCodesTable({ partitionKey, rowKey });

    return authorizationCodesTable ? [authorizationCodesTable] : [];
  }

  async authorization_codes_table_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getAuthorizationCodesTable({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const authorizationCodesTable = this._addAuthorizationCodesTable({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "authorization_codes_table_entities_create": authorizationCodesTable.etag }];
  }

  async authorization_codes_table_entities_remove(partition_key, row_key) {
    const authorizationCodesTable = this._getAuthorizationCodesTable({ partitionKey: partition_key, rowKey: row_key });
    this._removeAuthorizationCodesTable({ partitionKey: partition_key, rowKey: row_key });

    return authorizationCodesTable ? [{ etag: authorizationCodesTable.etag }] : [];
  }

  async authorization_codes_table_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const authorizationCodesTable = this._getAuthorizationCodesTable({ partitionKey: partition_key, rowKey: row_key });

    if (!authorizationCodesTable) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (authorizationCodesTable.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addAuthorizationCodesTable({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async authorization_codes_table_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.authorizationCodesTables);

    return entries.slice(offset, offset + size + 1);
  }

  async access_token_table_entities_load(partitionKey, rowKey) {
    const accessTokenTable = this._getAccessTokenTable({ partitionKey, rowKey });

    return accessTokenTable ? [accessTokenTable] : [];
  }

  async access_token_table_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getAccessTokenTable({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const accessTokenTable = this._addAccessTokenTable({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "access_token_table_entities_create": accessTokenTable.etag }];
  }

  async access_token_table_entities_remove(partition_key, row_key) {
    const accessTokenTable = this._getAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });
    this._removeAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });

    return accessTokenTable ? [{ etag: accessTokenTable.etag }] : [];
  }

  async access_token_table_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const accessTokenTable = this._getAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });

    if (!accessTokenTable) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (accessTokenTable.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addAccessTokenTable({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async access_token_table_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.accessTokenTables);

    return entries.slice(offset, offset + size + 1);
  }

  async session_storage_table_entities_load(partitionKey, rowKey) {
    const sessionStorageTable = this._getSessionStorageTable({ partitionKey, rowKey });

    return sessionStorageTable ? [sessionStorageTable] : [];
  }

  async session_storage_table_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getSessionStorageTable({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const sessionStorageTable = this._addSessionStorageTable({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "session_storage_table_entities_create": sessionStorageTable.etag }];
  }

  async session_storage_table_entities_remove(partition_key, row_key) {
    const sessionStorageTable = this._getSessionStorageTable({ partitionKey: partition_key, rowKey: row_key });
    this._removeSessionStorageTable({ partitionKey: partition_key, rowKey: row_key });

    return sessionStorageTable ? [{ etag: sessionStorageTable.etag }] : [];
  }

  async session_storage_table_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const sessionStorageTable = this._getSessionStorageTable({ partitionKey: partition_key, rowKey: row_key });

    if (!sessionStorageTable) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (sessionStorageTable.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addSessionStorageTable({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async session_storage_table_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.sessionStorageTables);

    return entries.slice(offset, offset + size + 1);
  }

  async github_access_token_table_entities_load(partitionKey, rowKey) {
    const githubAccessTokenTable = this._getGithubAccessTokenTable({ partitionKey, rowKey });

    return githubAccessTokenTable ? [githubAccessTokenTable] : [];
  }

  async github_access_token_table_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getGithubAccessTokenTable({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const githubAccessTokenTable = this._addGithubAccessTokenTable({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "github_access_token_table_entities_create": githubAccessTokenTable.etag }];
  }

  async github_access_token_table_entities_remove(partition_key, row_key) {
    const githubAccessTokenTable = this._getGithubAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });
    this._removeGithubAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });

    return githubAccessTokenTable ? [{ etag: githubAccessTokenTable.etag }] : [];
  }

  async github_access_token_table_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const githubAccessTokenTable = this._getGithubAccessTokenTable({ partitionKey: partition_key, rowKey: row_key });

    if (!githubAccessTokenTable) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (githubAccessTokenTable.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addGithubAccessTokenTable({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async github_access_token_table_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.githubAccessTokenTables);

    return entries.slice(offset, offset + size + 1);
  }
}

module.exports = FakeAuth;
