const assert = require('assert').strict;
const { READ } = require('taskcluster-lib-postgres');
const RowClass = require('./RowClass');

class Entity {
  constructor(options) {
    this.partitionKey = options.partitionKey;
    this.rowKey = options.rowKey;
    this.properties = options.properties;
    this.tableName = null;
    this.db = null;
    this.serviceName = null;
  }

  setup(options) {
    const { tableName, db, serviceName } = options;

    this.tableName = tableName;
    this.serviceName = serviceName;
    this.db = db;
  }

  // TODO: Fix this. This is totally wrong :-)
  calculateId(properties) {
    return `${properties[this.partitionKey]}${properties[this.rowKey]}`;
  }

  async create(properties, overwrite) {
    const documentId = this.calculateId(properties);

    let res;
    try {
      res = await this.db.procs[`${this.tableName}_create`](documentId, properties, overwrite, 1);
    } catch (err) {
      if (err.code !== '23505') {
        throw err;
      }
      const e = new Error('Entity already exists');
      e.code = 'EntityAlreadyExists';
      throw e;
    }

    const etag = res[0][`${this.tableName}_create`];

    return new RowClass(properties, { etag, tableName: this.tableName, documentId, db: this.db });
  }

  delete(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_delete`](documentId);
  }

  modify(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_modify`](documentId, properties, 1);
  }

  load(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_load`](documentId);
  }

  async scan(options = {}) {
    const {
      filter,
      limit = 1000,
      page = 1,
    } = options;

    if (filter) {
      assert(typeof filter === 'function', 'filter should be a function');
    }

    const result = await this.db._withClient(READ, client => {
      return client.query(`select * from ${this.tableName}`);
    });

    const filteredRows = filter ? result.rows.filter(filter) : result.rows;
    const pageCount = Math.ceil(filteredRows.length / limit);
    const rows = filteredRows.slice((page - 1) * limit, page * limit);
    const rowCount = rows.length;

    return {
      rows,
      rowCount,
      pageCount,
      page,
    };
  }

  static configure(options) {
    return new Entity(options);
  }
}

module.exports = {
  Entity,
};
